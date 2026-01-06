import { Router, type Request, type Response } from 'express';
import { devRouter } from './dev.js';
import { patientsRouter } from './patients.js';
import { appointmentsRouter } from './appointments.js';
import { clinicsRouter } from './clinics.js';
import { metricsRouter } from './metrics.js';
import { logEvent } from '../observability/eventLogger.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';
import type { PatientDoc } from '../types/patients.js';
import type { Role } from '../types/auth.js';

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
 * Fuente de verdad para la identidad del usuario en el frontend.
 * * Lógica Opción B (Profesional):
 * 1. Busca membresías de Staff. Si existen, devuelve staffClinics.
 * 2. Si NO hay membresías, busca vinculación de Paciente.
 * 3. Si es Paciente único -> Auto-resolución (role='patient', clinicId=...).
 * 4. Si es Paciente múltiple -> Sin resolución automática de clínica.
 */
apiRouter.get('/session', async (req: Request, res: Response) => {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	const db = getFirestoreDb();
	const uid = req.auth.uid;

	// Estructuras de respuesta
	const staffClinics: Array<{ clinicId: string; role: Role; clinicName: string | null }> = [];
	const patientClinics: Array<{ clinicId: string; clinicName: string | null; patientId: string }> = [];
	
	const resolved: {
		role: Role | null;
		clinicId: string | null;
		patientId: string | null;
	} = {
		role: null,
		clinicId: null,
		patientId: null
	};

	try {
		// ---------------------------------------------------------
		// A) Intentar resolver como Staff/Nutri/Admin
		// ---------------------------------------------------------
		const membershipsSnap = await db
			.collection('clinic_memberships')
			.where('uid', '==', uid)
			.where('isActive', '==', true)
			.get();

		if (!membershipsSnap.empty) {
			// Es Staff: Recopilar clínicas
			const clinicIdsToFetch = new Set<string>();
			
			for (const doc of membershipsSnap.docs) {
				const data = doc.data() as ClinicMembershipDoc;
				clinicIdsToFetch.add(data.clinicId);
				// El nombre se llenará después para optimizar lecturas
				staffClinics.push({
					clinicId: data.clinicId,
					role: data.role,
					clinicName: null 
				});
			}

			// Fetch optimizado de nombres de clínicas
			if (clinicIdsToFetch.size > 0) {
				const clinicRefs = Array.from(clinicIdsToFetch).map(id => db.collection('clinics').doc(id));
				const clinicsSnap = await db.getAll(...clinicRefs);
				const clinicNamesMap = new Map<string, string>();
				
				clinicsSnap.forEach(snap => {
					if (snap.exists) {
						const d = snap.data() as { name?: string };
						clinicNamesMap.set(snap.id, d.name ?? 'Sin nombre');
					}
				});

				// Asignar nombres
				staffClinics.forEach(item => {
					item.clinicName = clinicNamesMap.get(item.clinicId) ?? null;
				});
			}

			// NOTA: Para staff NO resolvemos automáticamente. El usuario debe elegir.
			// Si es platform_admin, ese flag ya va en el root del objeto data.

		} else {
			// ---------------------------------------------------------
			// B) Si NO es Staff -> Intentar resolver como Paciente
			// ---------------------------------------------------------
			const patientsSnap = await db
				.collection('patients')
				.where('linkedUid', '==', uid)
				.get();

			if (!patientsSnap.empty) {
				const clinicIdsToFetch = new Set<string>();

				for (const doc of patientsSnap.docs) {
					const pData = doc.data() as PatientDoc;
					if (pData.clinicId) {
						clinicIdsToFetch.add(pData.clinicId);
						patientClinics.push({
							clinicId: pData.clinicId,
							patientId: doc.id,
							clinicName: null
						});
					}
				}

				// Fetch optimizado de nombres
				if (clinicIdsToFetch.size > 0) {
					const clinicRefs = Array.from(clinicIdsToFetch).map(id => db.collection('clinics').doc(id));
					const clinicsSnap = await db.getAll(...clinicRefs);
					const clinicNamesMap = new Map<string, string>();

					clinicsSnap.forEach(snap => {
						if (snap.exists) {
							const d = snap.data() as { name?: string };
							clinicNamesMap.set(snap.id, d.name ?? 'Sin nombre');
						}
					});

					patientClinics.forEach(item => {
						item.clinicName = clinicNamesMap.get(item.clinicId) ?? null;
					});
				}

				// Lógica de Auto-resolución para Pacientes
				if (patientClinics.length === 1) {
					// Caso ideal: Paciente de una sola clínica -> Auto login
					const p = patientClinics[0];
					if (p) { // check de seguridad TS
						resolved.role = 'patient';
						resolved.clinicId = p.clinicId;
						resolved.patientId = p.patientId;
					}
				} else if (patientClinics.length > 1) {
					// Múltiples clínicas -> Rol patient, pero debe elegir clínica
					resolved.role = 'patient';
					resolved.clinicId = null; 
					resolved.patientId = null;
				}
			}
		}

		logEvent('session', {
			req,
			clinicId: null, // Contexto de sesión es global
			data: { 
				staffClinicsCount: staffClinics.length,
				patientClinicsCount: patientClinics.length,
				resolvedRole: resolved.role
			},
		});

		return res.status(200).json({
			success: true,
			data: {
				uid: req.auth.uid,
				email: req.auth.email,
				isPlatformAdmin: req.auth.isPlatformAdmin,
				staffClinics,
				patientClinics,
				resolved
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
