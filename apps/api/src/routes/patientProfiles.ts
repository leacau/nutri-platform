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
import type { PatientProfileDoc } from '../types/patientProfiles.js';

const router = Router();

const profileSchema = z.object({
	birthDate: z.string().optional().nullable(),
	gender: z.string().optional().nullable(),
	heightCm: z.number().optional().nullable(),
	occupation: z.string().optional().nullable(),
	activityLevel: z.enum(['sedentary', 'light', 'moderate', 'high']).optional().nullable(),
	goals: z.array(z.string()).optional().nullable(),
	medicalConditions: z.array(z.string()).optional().nullable(),
	allergies: z.array(z.string()).optional().nullable(),
	medications: z.array(z.string()).optional().nullable(),
	smoking: z.enum(['no', 'yes', 'former']).optional().nullable(),
	alcohol: z.enum(['no', 'social', 'frequent']).optional().nullable(),
	notesAdmin: z.string().optional().nullable(),
});

router.get(
	'/:patientId',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'nutri', 'patient', 'platform_admin', 'staff'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const db = getFirestoreDb();
		const patientId = req.params.patientId;
		if (!patientId) return res.status(400).json({ success: false, message: 'Missing patientId' });

		let patient: (PatientDoc & { id: string }) | null = null;
		if (auth.isPlatformAdmin) {
			const snap = await db.collection('patients').doc(patientId).get();
			if (snap.exists) patient = { id: snap.id, ...(snap.data() as PatientDoc) };
		} else if (auth.clinicId) {
			patient = await getDocInClinic<PatientDoc>(db, 'patients', patientId, auth.clinicId);
		}

		if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });
		if (auth.role === 'patient' && patient.linkedUid !== auth.uid) {
			return denyAuthz(req, res, 'Patients can only see their own profile');
		}

		const profileSnap = await db.collection('patient_profiles').doc(patientId).get();
		const profile = (profileSnap.data() as PatientProfileDoc | undefined) ?? null;

		return res.status(200).json({
			success: true,
			data: profile ? { ...profile, id: profileSnap.id } : null,
		});
	}
);

router.put(
	'/:patientId',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'nutri', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const db = getFirestoreDb();
		const patientId = req.params.patientId;
		if (!patientId) return res.status(400).json({ success: false, message: 'Missing patientId' });

	const parsed = profileSchema.safeParse(req.body ?? {});
	if (!parsed.success) {
		return res.status(400).json({ success: false, message: 'Invalid body', errors: parsed.error.flatten() });
	}

		let patient: (PatientDoc & { id: string }) | null = null;
		if (auth.isPlatformAdmin) {
			const snap = await db.collection('patients').doc(patientId).get();
			if (snap.exists) patient = { id: snap.id, ...(snap.data() as PatientDoc) };
		} else if (auth.clinicId) {
			patient = await getDocInClinic<PatientDoc>(db, 'patients', patientId, auth.clinicId);
		}
		if (!patient) return res.status(404).json({ success: false, message: 'Patient not found' });

	await db
		.collection('patient_profiles')
		.doc(patientId)
		.set(
			{
				patientId,
				birthDate: parsed.data.birthDate ?? null,
				gender: parsed.data.gender ?? null,
				heightCm: parsed.data.heightCm ?? null,
				occupation: parsed.data.occupation ?? null,
				activityLevel: parsed.data.activityLevel ?? null,
				goals: parsed.data.goals ?? null,
				medicalConditions: parsed.data.medicalConditions ?? null,
				allergies: parsed.data.allergies ?? null,
				medications: parsed.data.medications ?? null,
				smoking: parsed.data.smoking ?? null,
				alcohol: parsed.data.alcohol ?? null,
				notesAdmin: parsed.data.notesAdmin ?? null,
				updatedAt: Timestamp.now(),
			} satisfies PatientProfileDoc,
			{ merge: true }
		);

		const fresh = await db.collection('patient_profiles').doc(patientId).get();
		return res.status(200).json({ success: true, message: 'Profile saved', data: { id: fresh.id, ...(fresh.data() as any) } });
	}
);

export const patientProfilesRouter = router;
