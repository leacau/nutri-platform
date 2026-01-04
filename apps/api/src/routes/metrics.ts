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
import type { MetricDoc } from '../types/metrics.js';

const router = Router();

const createMetricSchema = z.object({
	patientId: z.string().min(1),
	visitId: z.string().optional().nullable(),
	measuredAt: z.string().optional(),
	weightKg: z.number().optional().nullable(),
	bmi: z.number().optional().nullable(),
	fatPercentage: z.number().optional().nullable(),
	muscleMass: z.number().optional().nullable(),
	waistCm: z.number().optional().nullable(),
	hipCm: z.number().optional().nullable(),
	bloodPressure: z.string().optional().nullable(),
});

router.post(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'nutri'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId ?? req.header('x-clinic-id') ?? null;
		if (!clinicId) return denyAuthz(req, res, 'Missing clinicId for metrics');

		const parsed = createMetricSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({ success: false, message: 'Invalid body', errors: parsed.error.flatten() });
		}

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(db, 'patients', parsed.data.patientId, clinicId);
		if (!patient) return res.status(404).json({ success: false, message: 'Patient not found in clinic' });
		const safePatient = patient as PatientDoc & { id: string };

		const now = Timestamp.now();
		const doc: MetricDoc = {
			clinicId,
			patientId: safePatient.id,
			visitId: parsed.data.visitId ?? null,
			measuredAt: parsed.data.measuredAt ? Timestamp.fromMillis(Date.parse(parsed.data.measuredAt)) : now,
			weightKg: parsed.data.weightKg ?? null,
			bmi: parsed.data.bmi ?? null,
			fatPercentage: parsed.data.fatPercentage ?? null,
			muscleMass: parsed.data.muscleMass ?? null,
			waistCm: parsed.data.waistCm ?? null,
			hipCm: parsed.data.hipCm ?? null,
			bloodPressure: parsed.data.bloodPressure ?? null,
			createdAt: now,
		};

		const ref = await db.collection('metrics').add(doc);
		return res.status(201).json({ success: true, message: 'Metric recorded', data: { id: ref.id, ...doc } });
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
		if (!clinicId && !auth.isPlatformAdmin) return denyAuthz(req, res, 'Missing clinicId for metrics listing');

		const patientIdFilter = (req.query.patientId as string | undefined) ?? null;
		const db = getFirestoreDb();
		let query = db.collection('metrics').orderBy('measuredAt', 'desc').limit(100);

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
			query = query.where('patientId', '==', first.id);
		}

		const snap = await query.get();
		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as MetricDoc) }));
		return res.status(200).json({ success: true, data: items });
	}
);

export const metricsRouter = router;
