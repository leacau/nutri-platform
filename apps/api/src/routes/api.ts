import { Router, type Request, type Response } from 'express';
import { patientsRouter } from './patients.js';
import { appointmentsRouter } from './appointments.js';
import { clinicsRouter } from './clinics.js';
import { metricsRouter } from './metrics.js';
import { usersRouter } from './users.js';
import { logEvent } from '../observability/eventLogger.js';
import { analyzeUserSession } from '../middlewares/resolveSessionContext.js';

export const apiRouter = Router();

/**
 * GET /session
 * Fuente de verdad unificada usando analyzeUserSession.
 */
apiRouter.get('/session', async (req: Request, res: Response) => {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	try {
		const xClinicId = req.header('x-clinic-id') as string | undefined;
		const analysis = await analyzeUserSession(req.auth.uid, xClinicId);

		logEvent('session', {
			req,
			clinicId: analysis.resolved.clinicId,
			data: {
				staffClinicsCount: analysis.staffClinics.length,
				patientClinicsCount: analysis.patientClinics.length,
				resolvedRole: analysis.resolved.role,
			},
		});

		return res.status(200).json({
			success: true,
			data: {
				uid: req.auth.uid,
				email: req.auth.email,
				isPlatformAdmin: req.auth.isPlatformAdmin,
				staffClinics: analysis.staffClinics,
				patientClinics: analysis.patientClinics,
				resolved: analysis.resolved,
			},
		});
	} catch (error) {
		console.error('Session error:', error);
		return res
			.status(500)
			.json({ success: false, message: 'Internal session error' });
	}
});

// Patients
apiRouter.use('/patients', patientsRouter);

// Appointments
apiRouter.use('/appointments', appointmentsRouter);

// Clinics
apiRouter.use('/clinics', clinicsRouter);

// Users
apiRouter.use('/users', usersRouter);

// Metrics
apiRouter.use('/metrics', metricsRouter);
