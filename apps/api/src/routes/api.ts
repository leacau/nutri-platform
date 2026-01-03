import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/requireRole.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { devRouter } from './dev.js';
import { patientsRouter } from './patients.js';
import { appointmentsRouter } from './appointments.js';
import { logEvent } from '../observability/eventLogger.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req: Request, res: Response) => {
	res.status(200).json({
		success: true,
		data: { ok: true },
		message: 'api healthy',
	});
});

apiRouter.get('/users/me', authMiddleware, (req: Request, res: Response) => {
	if (!req.auth) {
		return res.status(401).json({
			success: false,
			message: 'Unauthenticated',
		});
	}

	logEvent('login', {
		req,
		data: {
			endpoint: '/api/users/me',
			email: req.auth.email,
		},
	});

	return res.status(200).json({
		success: true,
		data: {
			uid: req.auth.uid,
			email: req.auth.email,
			role: req.auth.role ?? null,
			clinicId: req.auth.clinicId ?? null,
		},
	});
});

apiRouter.get(
	'/secure/clinic-scope',
	authMiddleware,
	requireRole('clinic_admin', 'nutri', 'staff'),
	requireClinicContext,
	(_req: Request, res: Response) => {
		res.status(200).json({
			success: true,
			data: { ok: true },
			message: 'clinic scoped access granted',
		});
	}
);

// Patients
apiRouter.use('/patients', patientsRouter);

// Appointments
apiRouter.use('/appointments', appointmentsRouter);

// DEV only
apiRouter.use('/dev', devRouter);
