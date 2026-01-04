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
import type { NutritionPlanDoc } from '../types/plans.js';

const router = Router();

const createPlanSchema = z.object({
	patientId: z.string().min(1),
	nutriUid: z.string().min(1),
	type: z.string().min(1),
	caloriesTarget: z.number().optional().nullable(),
	macros: z
		.object({
			protein: z.number().optional().nullable(),
			carbs: z.number().optional().nullable(),
			fat: z.number().optional().nullable(),
		})
		.optional()
		.nullable(),
	mealsPerDay: z.number().optional().nullable(),
	guidelines: z.string().optional().nullable(),
	validFrom: z.string().optional(),
	validTo: z.string().optional().nullable(),
});

router.post(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'nutri'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId ?? req.header('x-clinic-id') ?? null;
		if (!clinicId) return denyAuthz(req, res, 'Missing clinicId for plans');

		const parsed = createPlanSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({ success: false, message: 'Invalid body', errors: parsed.error.flatten() });
		}

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(db, 'patients', parsed.data.patientId, clinicId);
		if (!patient) return res.status(404).json({ success: false, message: 'Patient not found in clinic' });

		const now = Timestamp.now();
		const plan: NutritionPlanDoc = {
			clinicId,
			patientId: patient.id,
			nutriUid: parsed.data.nutriUid,
			type: parsed.data.type,
			caloriesTarget: parsed.data.caloriesTarget ?? null,
			macros: parsed.data.macros
				? {
						protein: parsed.data.macros.protein ?? null,
						carbs: parsed.data.macros.carbs ?? null,
						fat: parsed.data.macros.fat ?? null,
				  }
				: null,
			mealsPerDay: parsed.data.mealsPerDay ?? null,
			guidelines: parsed.data.guidelines ?? null,
			validFrom: parsed.data.validFrom ? Timestamp.fromMillis(Date.parse(parsed.data.validFrom)) : now,
			validTo: parsed.data.validTo ? Timestamp.fromMillis(Date.parse(parsed.data.validTo)) : null,
			active: true,
			createdAt: now,
			updatedAt: now,
		};

		// deactivate previous active plan
		const activeSnap = await db
			.collection('plans')
			.where('clinicId', '==', clinicId)
			.where('patientId', '==', patient.id)
			.where('active', '==', true)
			.limit(5)
			.get();
		for (const doc of activeSnap.docs) {
			await doc.ref.update({ active: false, updatedAt: now });
		}

		const ref = await db.collection('plans').add(plan);
		return res.status(201).json({ success: true, message: 'Plan created', data: { id: ref.id, ...plan } });
	}
);

router.get(
	'/:patientId/active',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'nutri', 'patient', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.isPlatformAdmin ? auth.clinicId ?? req.header('x-clinic-id') ?? null : auth.clinicId;
		const patientId = req.params.patientId;
		if (!patientId) return res.status(400).json({ success: false, message: 'Missing patientId' });
		if (!clinicId && !auth.isPlatformAdmin) return denyAuthz(req, res, 'Missing clinicId for plans');

		const db = getFirestoreDb();
		let patient: (PatientDoc & { id: string }) | null = null;
		if (clinicId) patient = await getDocInClinic<PatientDoc>(db, 'patients', patientId, clinicId);
		if (!patient && auth.isPlatformAdmin) {
			const snap = await db.collection('patients').doc(patientId).get();
			if (snap.exists) patient = { id: snap.id, ...(snap.data() as PatientDoc) };
		}
		if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

		if (auth.role === 'patient' && patient.linkedUid !== auth.uid) {
			return denyAuthz(req, res, 'Patients can only view their own plan');
		}

		const snap = await db
			.collection('plans')
			.where('patientId', '==', patient.id)
			.where('active', '==', true)
			.orderBy('validFrom', 'desc')
			.limit(1)
			.get();
		if (snap.empty) return res.status(200).json({ success: true, data: null });
		const doc = snap.docs[0];
		if (!doc) return res.status(200).json({ success: true, data: null });
		return res.status(200).json({ success: true, data: { id: doc.id, ...(doc.data() as NutritionPlanDoc) } });
	}
);

export const plansRouter = router;
