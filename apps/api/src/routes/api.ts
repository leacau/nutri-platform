import { Router, type Request, type Response } from 'express';
import { devRouter } from './dev.js';
import { patientsRouter } from './patients.js';
import { appointmentsRouter } from './appointments.js';
import { clinicsRouter } from './clinics.js';
import { logEvent } from '../observability/eventLogger.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';
import type { ClinicRole } from '../types/auth.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
	res.status(200).json({
		success: true,
		data: {
			ok: true,
		},
		message: 'api healthy',
	});
});

apiRouter.get('/session', authMiddleware, async (req: Request, res: Response) => {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	const db = getFirestoreDb();
	const membershipsSnap = await db
		.collection('clinic_memberships')
		.where('uid', '==', req.auth.uid)
		.where('isActive', '==', true)
		.get();

	const clinics: Array<{ clinicId: string; role: ClinicRole; clinicName: string | null }> = [];

	for (const doc of membershipsSnap.docs) {
		const data = doc.data() as ClinicMembershipDoc;
		const clinicSnap = await db.collection('clinics').doc(data.clinicId).get();
		const clinicName = clinicSnap.exists ? ((clinicSnap.data() as { name?: string })?.name ?? null) : null;
		clinics.push({
			clinicId: data.clinicId,
			role: data.role,
			clinicName,
		});
	}

	logEvent('session', {
		req,
		clinicId: req.auth.clinicId ?? null,
		data: { clinics: clinics.length },
	});

	return res.status(200).json({
		success: true,
		data: {
			uid: req.auth.uid,
			email: req.auth.email,
			isPlatformAdmin: req.auth.isPlatformAdmin,
			clinics,
		},
	});
});

// Patients
apiRouter.use('/patients', patientsRouter);

// Appointments
apiRouter.use('/appointments', appointmentsRouter);

// Clinics
apiRouter.use('/clinics', clinicsRouter);

// DEV only
apiRouter.use('/dev', devRouter);
