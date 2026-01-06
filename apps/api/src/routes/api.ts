import { Router, type Request, type Response } from 'express';
import { devRouter } from './dev.js';
import { patientsRouter } from './patients.js';
import { appointmentsRouter } from './appointments.js';
import { clinicsRouter } from './clinics.js';
import { metricsRouter } from './metrics.js';
import { logEvent } from '../observability/eventLogger.js';
import { analyzeUserSession } from '../middlewares/resolveSessionContext.js';
import { requireAuth } from '../middlewares/requireAuth.js'; // Aseguramos import

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
		// Usamos la misma lógica que el middleware
		const analysis = await analyzeUserSession(req.auth.uid, xClinicId);

		logEvent('session', {
			req,
			clinicId: analysis.resolved.clinicId,
			data: { 
				staffClinicsCount: analysis.staffClinics.length,
				patientClinicsCount: analysis.patientClinics.length,
				resolvedRole: analysis.resolved.role
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
				resolved: analysis.resolved
			},
		});

	} catch (error) {
		console.error('Session error:', error);
		return res.status(500).json({ success: false, message: 'Internal session error' });
	}
});

// Patients
apiRouter.use('/patients', patientsRouter);

// Appointments
apiRouter.use('/appointments', appointmentsRouter);

// Clinics
apiRouter.use('/clinics', clinicsRouter);

// Metrics
apiRouter.use('/metrics', metricsRouter);

// DEV only
apiRouter.use('/dev', devRouter);
