import { Router, type Request, type Response } from 'express';
import { patientsRouter } from './patients.js';
import { appointmentsRouter } from './appointments.js';
import { adminClinicsRouter, clinicsRouter } from './clinics.js';
import { metricsRouter } from './metrics.js';
import { usersRouter } from './users.js';
import { logEvent, writeAuditLog } from '../observability/eventLogger.js';
import { analyzeUserSession } from '../middlewares/resolveSessionContext.js';
import { auditRouter } from './audit.js';
import { complianceRouter } from './compliance.js';
import { messageTemplatesRouter } from './messageTemplates.js';

export const apiRouter = Router();
import { authMiddleware } from '../middlewares/authMiddleware.js';

apiRouter.get(
	'/session',
	authMiddleware,
	async (req: Request, res: Response) => {
		console.log('[session] start', {
			projectId: process.env.FIREBASE_PROJECT_ID,
			databaseId: process.env.FIRESTORE_DATABASE_ID,
			hasAuth: Boolean(req.auth),
		});
		if (!req.auth) {
			return res
				.status(401)
				.json({ success: false, message: 'Unauthenticated' });
		}

		try {
			const xClinicId = req.header('x-clinic-id') as string | undefined;

			// PASAMOS EL isPlatformAdmin AL ANALIZADOR
			const analysis = await analyzeUserSession(
				req.auth.uid,
				xClinicId,
				req.auth.isPlatformAdmin,
			);

			logEvent('session', {
				req,
				clinicId: analysis.resolved.clinicId,
				data: {
					staffClinicsCount: analysis.staffClinics.length,
					patientClinicsCount: analysis.patientClinics.length,
					resolvedRole: analysis.resolved.role,
				},
			});
			await writeAuditLog({
				req,
				clinicId: analysis.resolved.clinicId,
				patientId: analysis.resolved.patientId,
				actionType: 'SESSION_READ',
				detail: 'Lectura de sesión y contexto activo',
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
			console.error('[session] firestore error', error);
			return res
				.status(500)
				.json({ success: false, message: 'Internal session error' });
		}
	},
);

// Patients
apiRouter.use('/patients', patientsRouter);

// Appointments
apiRouter.use('/appointments', appointmentsRouter);

// Clinics
apiRouter.use('/clinics', clinicsRouter);

// Platform admin
apiRouter.use('/admin/clinics', adminClinicsRouter);

// Users
apiRouter.use('/users', usersRouter);

// Metrics
apiRouter.use('/metrics', metricsRouter);

// Audit
apiRouter.use('/audit', auditRouter);

// Compliance
apiRouter.use('/compliance', complianceRouter);

// Automated message templates
apiRouter.use('/templates', messageTemplatesRouter);
