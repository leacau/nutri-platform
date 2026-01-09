import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { resolveSessionContext } from '../middlewares/resolveSessionContext.js'; // <--- Nuevo
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import { getDocInClinic } from '../security/getDocInClinic.js';
import type { PatientDoc } from '../types/patients.js';
import type { MetricDoc } from '../types/metrics.js';

const router = Router();

// Aplicar resolución de sesión para todas las rutas de métricas
// Esto habilita el soporte de Patient Portal (req.patientContext)
router.use(resolveSessionContext);

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
	requireClinicContext,
	requireRole('clinic_admin', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId; 
		// clinicId garantizado por requireClinicContext (que corre despues de resolveSessionContext)
		
		const parsed = createMetricSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({ success: false, message: 'Invalid body', errors: parsed.error.flatten() });
		}

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(db, 'patients', parsed.data.patientId, clinicId!);
		if (!patient) return res.status(404).json({ success: false, message: 'Patient not found in clinic' });
		const safePatient = patient as PatientDoc & { id: string };
		if (
			auth.role === 'professional' &&
			!(safePatient.assignedProfessionalUids ?? []).includes(auth.uid)
		) {
			return denyAuthz(req, res, 'Professionals can only record metrics for their patients');
		}

		const now = Timestamp.now();
		const doc: MetricDoc = {
			clinicId: clinicId!,
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
	requireClinicContext,
	requireRole('clinic_admin', 'professional', 'patient', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!; // requireClinicContext asegura esto

		const patientIdFilter = (req.query.patientId as string | undefined) ?? null;
		const db = getFirestoreDb();
		let query = db.collection('metrics').orderBy('measuredAt', 'desc').limit(100);

		if (!auth.isPlatformAdmin) {
			query = query.where('clinicId', '==', clinicId);
		} else if (clinicId) {
			query = query.where('clinicId', '==', clinicId);
		}
		
		// Seguridad para Paciente: Forzar filtro a SU propio ID
		if (auth.role === 'patient') {
			if (!req.patientContext?.patientId) {
				return denyAuthz(req, res, 'Patient context not resolved');
			}
			// Sobreescribimos cualquier filtro que venga del front con el ID real del paciente logueado
			query = query.where('patientId', '==', req.patientContext.patientId);
		} else if (auth.role === 'professional') {
			if (!patientIdFilter) {
				return res.status(400).json({
					success: false,
					message: 'patientId is required for professional metrics listing',
				});
			}
			const patient = await getDocInClinic<PatientDoc>(
				db,
				'patients',
				patientIdFilter,
				clinicId
			);
			if (!patient || !(patient.assignedProfessionalUids ?? []).includes(auth.uid)) {
				return denyAuthz(
					req,
					res,
					'Professionals can only view metrics for their patients'
				);
			}
			query = query.where('patientId', '==', patientIdFilter);
		} else {
			// Para clinic_admin, filtro opcional
			if (patientIdFilter) query = query.where('patientId', '==', patientIdFilter);
		}

		const snap = await query.get();
		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as MetricDoc) }));
		return res.status(200).json({ success: true, data: items });
	}
);

export const metricsRouter = router;
