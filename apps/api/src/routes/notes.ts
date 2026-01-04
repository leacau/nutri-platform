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
import type { ClinicalNoteDoc } from '../types/notes.js';

const router = Router();

const createNoteSchema = z.object({
	patientId: z.string().min(1),
	content: z.string().min(1),
	visibility: z.enum(['private', 'shared']).default('private'),
});

router.post(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'nutri'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId ?? req.header('x-clinic-id') ?? null;
		if (!clinicId) return denyAuthz(req, res, 'Missing clinicId for notes');

		const parsed = createNoteSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({ success: false, message: 'Invalid body', errors: parsed.error.flatten() });
		}

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(db, 'patients', parsed.data.patientId, clinicId);
		if (!patient) return res.status(404).json({ success: false, message: 'Patient not found in clinic' });
		const safePatient = patient as PatientDoc & { id: string };

		const now = Timestamp.now();
		const note: ClinicalNoteDoc = {
			clinicId,
			patientId: safePatient.id,
			nutriUid: auth.role === 'nutri' ? auth.uid : safePatient.assignedNutriUid ?? auth.uid,
			content: parsed.data.content,
			visibility: parsed.data.visibility,
			createdAt: now,
		};

		const ref = await db.collection('notes').add(note);
		return res.status(201).json({ success: true, message: 'Note added', data: { id: ref.id, ...note } });
	}
);

router.get(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'nutri', 'patient', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.isPlatformAdmin ? auth.clinicId ?? req.header('x-clinic-id') ?? null : auth.clinicId;
		if (!clinicId && !auth.isPlatformAdmin) return denyAuthz(req, res, 'Missing clinicId for notes');

		const patientIdFilter = (req.query.patientId as string | undefined) ?? null;
		const db = getFirestoreDb();
		let query = db.collection('notes').orderBy('createdAt', 'desc').limit(100);

		if (!auth.isPlatformAdmin) {
			query = query.where('clinicId', '==', clinicId);
		} else if (clinicId) {
			query = query.where('clinicId', '==', clinicId);
		}
		if (patientIdFilter) query = query.where('patientId', '==', patientIdFilter);

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
			query = query.where('patientId', '==', first.id).where('visibility', '==', 'shared');
		}

		const snap = await query.get();
		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ClinicalNoteDoc) }));
		return res.status(200).json({ success: true, data: items });
	}
);

export const notesRouter = router;
