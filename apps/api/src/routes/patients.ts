import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { PatientDoc } from '../types/patients.js';
import { sanitizePatientForRole } from '../security/patientSanitizer.js';
import { getDocInClinic } from '../security/getDocInClinic.js';
import { logEvent } from '../observability/eventLogger.js';
import type { Role } from '../types/auth.js';

export const patientsRouter = Router();

const createPatientSchema = z.object({
	name: z.string().min(2),
	email: z.string().email().optional().nullable(),
	phone: z.string().min(5).optional().nullable(),
	assignedNutriUid: z.string().min(1),
	status: z.enum(['active', 'inactive', 'discharged']).default('active'),
});

const patchPatientSchema = z.object({
	name: z.string().min(2).optional(),
	email: z.string().email().optional().nullable(),
	phone: z.string().min(5).optional().nullable(),
	assignedNutriUid: z.string().min(1).optional(),
	status: z.enum(['active', 'inactive', 'discharged']).optional(),
});

const assignNutriSchema = z.object({
	nutriUid: z.string().min(1).nullable(),
});

function clinicScopedUnlessPlatformAdmin(req: Request, res: Response, next: () => void) {
	if (req.auth?.isPlatformAdmin) return next();
	return requireClinicContext(req, res, next);
}

patientsRouter.get(
	'/',
	authMiddleware,
	clinicScopedUnlessPlatformAdmin,
	async (req: Request, res: Response) => {
		const auth = req.auth;
		if (!auth) return res.status(401).json({ success: false, message: 'Unauthenticated' });

		const db = getFirestoreDb();
		const clinicId = auth.isPlatformAdmin
			? req.auth?.clinicId ?? req.header('x-clinic-id') ?? null
			: auth.clinicId;

		if (!clinicId) {
			return denyAuthz(req, res, 'Missing clinicId for clinic listing');
		}

		let query = db.collection('patients').where('clinicId', '==', clinicId);
		if (auth.role === 'nutri') {
			query = query.where('assignedNutriUid', '==', auth.uid);
		}
		if (auth.role === 'patient') {
			query = query.where('linkedUid', '==', auth.uid);
		}

		const snap = await query.limit(100).get();
		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as PatientDoc) }));

		return res.status(200).json({
			success: true,
			data: items.map((p) => sanitizePatientForRole((auth.role ?? 'platform_admin') as Role, p)),
		});
	}
);

patientsRouter.post(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'nutri', 'staff', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const parsed = createPatientSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const clinicId = auth.isPlatformAdmin ? auth.clinicId ?? req.header('x-clinic-id') ?? null : auth.clinicId;
		if (!clinicId) {
			return denyAuthz(req, res, 'Missing clinic context when creating patient');
		}

		if (auth.role === 'staff') {
			return denyAuthz(req, res, 'Staff cannot set assignedNutriUid');
		}

		const now = Timestamp.now();
		const doc: PatientDoc = {
			clinicId,
			assignedNutriUid: parsed.data.assignedNutriUid ?? null,
			name: parsed.data.name,
			email: parsed.data.email ?? null,
			phone: parsed.data.phone ?? null,
			linkedUid: null,
			status: parsed.data.status ?? 'active',
			createdAt: now,
			updatedAt: now,
		};

		const db = getFirestoreDb();
		const ref = db.collection('patients').doc();
		await ref.set(doc);

		const created = { id: ref.id, ...doc };
		logEvent('patient_created', { req, clinicId, data: { patientId: ref.id } });

		return res.status(201).json({
			success: true,
			message: 'Patient created',
			data: sanitizePatientForRole((auth.role ?? 'platform_admin') as Role, created),
		});
	}
);

patientsRouter.patch(
	'/:id',
	authMiddleware,
	clinicScopedUnlessPlatformAdmin,
	requireRole('clinic_admin', 'nutri', 'staff', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const parsed = patchPatientSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const db = getFirestoreDb();
		const clinicIdHeader = auth.isPlatformAdmin ? req.header('x-clinic-id') : auth.clinicId;
		const clinicId = clinicIdHeader ?? null;
		const patientId = req.params.id;

		if (!patientId) {
			return res.status(400).json({ success: false, message: 'Missing patient id' });
		}

		let current: (PatientDoc & { id: string }) | null = null;
		if (auth.isPlatformAdmin && clinicId === null) {
			const snap = await db.collection('patients').doc(patientId).get();
			if (snap.exists) {
				current = { id: snap.id, ...(snap.data() as PatientDoc) };
			}
		} else if (clinicId) {
			current = await getDocInClinic<PatientDoc>(db, 'patients', patientId, clinicId);
		}

		if (!current) {
			return res.status(404).json({ success: false, message: 'Patient not found' });
		}

		if (auth.role === 'staff' && parsed.data.assignedNutriUid !== undefined) {
			return denyAuthz(req, res, 'Staff cannot reassign nutricionists');
		}

		if (auth.role === 'nutri' && parsed.data.assignedNutriUid !== undefined) {
			if (parsed.data.assignedNutriUid && parsed.data.assignedNutriUid !== auth.uid) {
				return denyAuthz(req, res, 'Nutri cannot assign patient to another nutri');
			}
		}

		const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
		if (parsed.data.name !== undefined) update.name = parsed.data.name;
		if (parsed.data.email !== undefined) update.email = parsed.data.email ?? null;
		if (parsed.data.phone !== undefined) update.phone = parsed.data.phone ?? null;
		if (parsed.data.assignedNutriUid !== undefined) {
			if (auth.role === 'nutri') {
				update.assignedNutriUid = auth.uid;
			} else {
				update.assignedNutriUid = parsed.data.assignedNutriUid ?? null;
			}
		}
		if (parsed.data.status !== undefined && auth.role !== 'staff') {
			update.status = parsed.data.status;
		}

		await db.collection('patients').doc(patientId).update(update);

		const freshSnap = await db.collection('patients').doc(patientId).get();
		const fresh = { id: freshSnap.id, ...(freshSnap.data() as PatientDoc) };

		return res.status(200).json({
			success: true,
			message: 'Patient updated',
			data: sanitizePatientForRole((auth.role ?? 'platform_admin') as Role, fresh),
		});
	}
);

patientsRouter.post(
	'/:id/assign-nutri',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId;
		if (!clinicId) return denyAuthz(req, res, 'Missing clinic context on assign');

		const patientId = req.params.id;
		if (!patientId) return res.status(400).json({ success: false, message: 'Missing patient id' });

		const parsed = assignNutriSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(db, 'patients', patientId, clinicId);
		if (!patient) {
			return res.status(404).json({ success: false, message: 'Patient not found in clinic' });
		}

		const nutriUid = parsed.data.nutriUid;
		if (nutriUid) {
			const membership = await db
				.collection('clinic_memberships')
				.where('clinicId', '==', clinicId)
				.where('uid', '==', nutriUid)
				.where('role', '==', 'nutri')
				.where('isActive', '==', true)
				.limit(1)
				.get();

			if (membership.empty) {
				return res.status(400).json({
					success: false,
					message: 'nutriUid is not an active nutri in this clinic',
				});
			}
		}

		await db.collection('patients').doc(patientId).update({
			assignedNutriUid: nutriUid ?? null,
			updatedAt: Timestamp.now(),
		});

		return res.status(200).json({
			success: true,
			message: 'Patient assigned',
			data: { id: patientId, assignedNutriUid: nutriUid ?? null },
		});
	}
);
