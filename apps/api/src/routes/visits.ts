import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import { getDocInClinic } from '../security/getDocInClinic.js';
import type { PatientDoc } from '../types/patients.js';
import type { VisitDoc } from '../types/visits.js';

const router = Router();

const createVisitSchema = z.object({
	patientId: z.string().min(1),
	appointmentId: z.string().optional().nullable(),
	date: z.string().optional(),
	reason: z.string().optional().nullable(),
	clinicalNotes: z.string().optional().nullable(),
	adherence: z.enum(['low', 'medium', 'high']).optional().nullable(),
	recommendations: z.string().optional().nullable(),
});

router.post(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId ?? req.header('x-clinic-id') ?? null;
		if (!clinicId) return denyAuthz(req, res, 'Missing clinicId for visits');

		const parsed = createVisitSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({ success: false, message: 'Invalid body', errors: parsed.error.flatten() });
		}

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(db, 'patients', parsed.data.patientId, clinicId);
		if (!patient) return res.status(404).json({ success: false, message: 'Patient not found in clinic' });
		const safePatient = patient as PatientDoc & { id: string };

		const now = Timestamp.now();
		const doc: VisitDoc = {
			clinicId,
			patientId: safePatient.id,
			professionalUid:
				auth.role === 'professional'
					? auth.uid
					: (safePatient.assignedProfessionalUids ?? [])[0] ?? auth.uid,
			appointmentId: parsed.data.appointmentId ?? null,
			date: parsed.data.date ? Timestamp.fromMillis(Date.parse(parsed.data.date)) : now,
			reason: parsed.data.reason ?? null,
			clinicalNotes: parsed.data.clinicalNotes ?? null,
			adherence: parsed.data.adherence ?? null,
			recommendations: parsed.data.recommendations ?? null,
			createdAt: now,
			updatedAt: now,
		};

		const ref = await db.collection('visits').add(doc);
		return res.status(201).json({ success: true, message: 'Visit recorded', data: { id: ref.id, ...doc } });
	}
);

router.get(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'professional', 'patient', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.isPlatformAdmin ? auth.clinicId ?? req.header('x-clinic-id') ?? null : auth.clinicId;
		if (!clinicId && !auth.isPlatformAdmin) return denyAuthz(req, res, 'Missing clinicId for visits listing');

		const patientIdFilter = (req.query.patientId as string | undefined) ?? null;
		const db = getFirestoreDb();
		let query = db.collection('visits').orderBy('date', 'desc').limit(100);

		if (!auth.isPlatformAdmin) {
			query = query.where('clinicId', '==', clinicId);
		} else if (clinicId) {
			query = query.where('clinicId', '==', clinicId);
		}
		if (patientIdFilter) query = query.where('patientId', '==', patientIdFilter);

		// patient role: only own
		if (auth.role === 'patient') {
			const patientSnap = await db
				.collection('patients')
				.where('linkedUid', '==', auth.uid)
				.where('clinicId', '==', clinicId)
				.limit(1)
				.get();
			if (patientSnap.empty) return denyAuthz(req, res, 'Patient not linked');
			const first = patientSnap.docs[0];
			if (!first) return denyAuthz(req, res, 'Patient not linked');
			query = query.where('patientId', '==', first.id);
		}

		const snap = await query.get();
		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as VisitDoc) }));
		return res.status(200).json({ success: true, data: items });
	}
);

export const visitsRouter = router;
