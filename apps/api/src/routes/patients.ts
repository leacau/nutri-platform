import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/requireRole.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import { getFirebaseAdmin } from '../firebase/admin.js';
import type { PatientDoc } from '../types/patients.js';
import { sanitizePatientForRole } from '../security/patientSanitizer.js';
import { getDocInClinic } from '../security/getDocInClinic.js';
import { Timestamp } from 'firebase-admin/firestore';
import { denyAuthz } from '../security/authz.js';

export const patientsRouter = Router();

/**
 * GET /api/patients
 * - clinic_admin/nutri: lista completa por clínica
 * - staff: lista por clínica pero sanitizada (solo contacto)
 * - platform_admin: ve todo (operaciones) - en prod lo auditamos
 */
patientsRouter.get(
	'/',
	authMiddleware,
	requireRole('clinic_admin', 'nutri', 'staff', 'platform_admin'),
	async (req: Request, res: Response) => {
		const db = getFirestoreDb();
		const role = req.auth!.role!;

		// platform_admin: puede ver todo (potente, auditar en prod)
		if (role === 'platform_admin') {
			const snap = await db.collection('patients').limit(100).get();
			const items = snap.docs.map((d) => ({
				...(d.data() as PatientDoc),
				id: d.id,
			}));

			return res.status(200).json({
				success: true,
				data: items.map((p) => sanitizePatientForRole(role, p)),
			});
		}

		// clinic roles: requieren contexto de clínica (fail closed)
		return requireClinicContext(req, res, async () => {
			const clinicId = req.auth!.clinicId!;

			const snap = await db
				.collection('patients')
				.where('clinicId', '==', clinicId)
				.limit(100)
				.get();

			const items = snap.docs.map((d) => ({
				...(d.data() as PatientDoc),
				id: d.id,
			}));

			return res.status(200).json({
				success: true,
				data: items.map((p) => sanitizePatientForRole(role, p)),
			});
		});
	}
);

/**
 * GET /api/patients/me
 * - patient: obtiene su perfil solo si linkedUid === uid
 * - otros roles: 403 (evitamos abuso y ambigüedad)
 */
patientsRouter.get(
	'/me',
	authMiddleware,
	requireRole('patient'),
	async (req: Request, res: Response) => {
		const db = getFirestoreDb();
		const uid = req.auth!.uid;

		const snap = await db
			.collection('patients')
			.where('linkedUid', '==', uid)
			.limit(1)
			.get();

		if (snap.empty) {
			return res.status(404).json({
				success: false,
				message: 'Patient profile not found',
			});
		}

		const doc = snap.docs.at(0);
		if (!doc) {
			return res.status(500).json({
				success: false,
				message: 'Failed to resolve patient profile',
			});
		}
		const patient = { ...(doc.data() as PatientDoc), id: doc.id };

		return res.status(200).json({
			success: true,
			data: sanitizePatientForRole('patient', patient),
		});
	}
);

const createPatientSchema = z.object({
	name: z.string().min(2),
	email: z.string().email().optional().nullable(),
	phone: z.string().min(5).optional().nullable(),

	// SOLO para platform_admin (operaciones). Clinic roles toman clinicId del token.
	clinicId: z.string().min(1).optional(),

	// ⚠️ linkedUid NO se acepta acá. Linkeo es endpoint dedicado.
});

/**
 * POST /api/patients
 * - staff: puede crear SOLO contacto (name/email/phone)
 * - nutri/clinic_admin: puede crear
 * - platform_admin: puede crear (requiere clinicId en body)
 *
 * Reglas:
 * - clinicId SIEMPRE viene del token, excepto platform_admin
 * - linkedUid: NO permitido en este endpoint (usar /:id/link)
 */
patientsRouter.post(
	'/',
	authMiddleware,
	requireRole('clinic_admin', 'nutri', 'staff', 'platform_admin', 'patient'),
	async (req: Request, res: Response) => {
		const role = req.auth!.role!;
		const uid = req.auth!.uid;
		const db = getFirestoreDb();

		const parsed = createPatientSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		// clinicId seguro
		let clinicId: string | null = null;

		if (role === 'platform_admin') {
			if (!parsed.data.clinicId) {
				return res.status(400).json({
					success: false,
					message:
						'clinicId is required for platform_admin when creating patients',
				});
			}
			clinicId = parsed.data.clinicId;
		} else if (role === 'patient') {
			clinicId = req.auth!.clinicId ?? null;
			if (!clinicId) {
				return denyAuthz(
					req,
					res,
					'Patient tried to create profile without clinicId claim'
				);
			}

			// Evitamos duplicados si ya hay un paciente vinculado a este uid
			const existing = await db
				.collection('patients')
				.where('linkedUid', '==', uid)
				.limit(1)
				.get();
			if (!existing.empty) {
				const doc = existing.docs.at(0);
				if (!doc) {
					return res.status(500).json({
						success: false,
						message: 'Failed to resolve existing patient for this user',
					});
				}
				return res.status(409).json({
					success: false,
					message: 'A patient is already linked to this user',
					data: { id: doc.id },
				});
			}
		} else {
			clinicId = req.auth!.clinicId ?? null;
		}

		if (!clinicId) {
			return denyAuthz(req, res, 'Missing clinicId claim on patient creation');
		}

		const now = new Date();

		const doc: Omit<PatientDoc, 'createdAt' | 'updatedAt'> = {
			clinicId,
			name: parsed.data.name,
			email: parsed.data.email ?? null,
			phone: parsed.data.phone ?? null,
			linkedUid: role === 'patient' ? uid : null, // linkeo automático para pacientes; clinic roles usan endpoint dedicado
		};

		const ref = db.collection('patients').doc();
		await ref.set({
			...doc,
			createdAt: now,
			updatedAt: now,
		});

		const createdSnap = await ref.get();
		const created = {
			...(createdSnap.data() as PatientDoc),
			id: createdSnap.id,
		};

		return res.status(201).json({
			success: true,
			message: 'Patient created',
			data: sanitizePatientForRole(role, created),
		});
	}
);

const linkPatientSchema = z.object({
	linkedUid: z.string().min(1).nullable(),
});

/**
 * PATCH /api/patients/:id/link
 * - clinic_admin/nutri: puede linkear / unlinkear (dentro de su clínica)
 * - platform_admin: puede linkear cualquier (operaciones) - en prod audit
 * - patient: puede autovincularse a un paciente dentro de su clínica (no unlink)
 *
 * Reglas:
 * - staff: NO
 * - si linkedUid != null, debe existir en Auth (emulador incluido)
 * - clinic roles: aislamiento estricto usando getDocInClinic
 */
patientsRouter.patch(
	'/:id/link',
	authMiddleware,
	requireRole('clinic_admin', 'nutri', 'platform_admin', 'patient'),
	async (req: Request, res: Response) => {
		const db = getFirestoreDb();
		const role = req.auth!.role!;
		const uid = req.auth!.uid;
		const id = req.params.id ?? '';

		if (!id) {
			return res.status(400).json({
				success: false,
				message: 'Missing patient id',
			});
		}

		const parsed = linkPatientSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		// Flujo self-service: un paciente solo puede linkearse a sí mismo y nunca deslinkear.
		if (role === 'patient') {
			if (parsed.data.linkedUid === null) {
				return denyAuthz(req, res, 'Patient attempted to unlink self');
			}
			if (parsed.data.linkedUid !== uid) {
				return denyAuthz(
					req,
					res,
					`Patient ${uid} tried to link different uid ${parsed.data.linkedUid}`
				);
			}

			const snap = await db.collection('patients').doc(id).get();
			if (!snap.exists) {
				return res.status(404).json({ success: false, message: 'Not found' });
			}

			const current = { ...(snap.data() as PatientDoc), id: snap.id };
			const claimClinicId = req.auth!.clinicId ?? null;

			if (claimClinicId && current.clinicId !== claimClinicId) {
				return denyAuthz(
					req,
					res,
					`Patient ${uid} tried to link profile from clinic ${current.clinicId}`
				);
			}

			if (current.linkedUid && current.linkedUid !== uid) {
				return res.status(409).json({
					success: false,
					message: 'Patient is already linked to another user',
				});
			}

			if (current.linkedUid === uid) {
				return res.status(200).json({
					success: true,
					message: 'Patient already linked to this user',
					data: sanitizePatientForRole(role, current),
				});
			}

			await db.collection('patients').doc(id).update({
				linkedUid: uid,
				updatedAt: new Date(),
			});

			const freshSnap = await db.collection('patients').doc(id).get();
			const fresh = { ...(freshSnap.data() as PatientDoc), id: freshSnap.id };

			return res.status(200).json({
				success: true,
				message: 'Patient linked',
				data: sanitizePatientForRole(role, fresh),
			});
		}

		// Cargar doc con aislamiento
		let current: (PatientDoc & { id: string }) | null = null;

		if (role === 'platform_admin') {
			const snap = await db.collection('patients').doc(id).get();
			if (!snap.exists) {
				return res.status(404).json({ success: false, message: 'Not found' });
			}
			current = { ...(snap.data() as PatientDoc), id: snap.id };
		} else {
			// requiere contexto de clínica
			const clinicIdClaim = req.auth!.clinicId;
			if (!clinicIdClaim) {
				return denyAuthz(
					req,
					res,
					'Missing clinicId claim when linking patient in clinic scope'
				);
			}

			current = await getDocInClinic<PatientDoc>(
				db,
				'patients',
				id,
				clinicIdClaim
			);
			if (!current) {
				return res.status(404).json({ success: false, message: 'Not found' });
			}
		}

		const linkedUid = parsed.data.linkedUid;

		// Validar existencia de usuario si no es null
		if (linkedUid !== null) {
			const { auth } = getFirebaseAdmin();
			try {
				await auth.getUser(linkedUid);
			} catch {
				return res.status(400).json({
					success: false,
					message: 'linkedUid does not exist in Auth',
				});
			}
		}

		await db.collection('patients').doc(id).update({
			linkedUid,
			updatedAt: new Date(),
		});

		const freshSnap = await db.collection('patients').doc(id).get();
		const fresh = { ...(freshSnap.data() as PatientDoc), id: freshSnap.id };

		return res.status(200).json({
			success: true,
			message: linkedUid ? 'Patient linked' : 'Patient unlinked',
			data: sanitizePatientForRole(role, fresh),
		});
	}
);

const patchPatientSchema = z.object({
	name: z.string().min(2).optional(),
	email: z.string().email().optional().nullable(),
	phone: z.string().min(5).optional().nullable(),
	assignedNutriUid: z.string().min(1).optional().nullable(),

	// linkedUid NO acá: linkeo es endpoint dedicado
});

/**
 * PATCH /api/patients/:id
 * - staff: SOLO contacto (name/email/phone)
 * - nutri/clinic_admin: puede editar contacto también
 * - platform_admin: puede editar (sin restricciones por clínica pero lo auditaremos luego)
 * - aislamiento: clinic roles usan getDocInClinic
 */
patientsRouter.patch(
	'/:id',
	authMiddleware,
	requireRole('clinic_admin', 'nutri', 'staff', 'platform_admin'),
	async (req: Request, res: Response) => {
		const db = getFirestoreDb();
		const role = req.auth!.role!;
		const id = req.params.id ?? '';

		if (!id) {
			return res.status(400).json({
				success: false,
				message: 'Missing patient id',
			});
		}

		const parsed = patchPatientSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		// Cargar doc asegurando aislamiento
		let current: (PatientDoc & { id: string }) | null = null;

		if (role === 'platform_admin') {
			const snap = await db.collection('patients').doc(id).get();
			if (!snap.exists) {
				return res.status(404).json({ success: false, message: 'Not found' });
			}
			current = { ...(snap.data() as PatientDoc), id: snap.id };
		} else {
			// requiere contexto de clínica
			const clinicIdClaim = req.auth!.clinicId;
			if (!clinicIdClaim) {
				return denyAuthz(
					req,
					res,
					'Missing clinicId claim when updating patient'
				);
			}

			current = await getDocInClinic<PatientDoc>(
				db,
				'patients',
				id,
				clinicIdClaim
			);
			if (!current) {
				return res.status(404).json({ success: false, message: 'Not found' });
			}
		}

		const update: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		// staff: solo contacto
		if (role === 'staff') {
			if (parsed.data.name !== undefined) update.name = parsed.data.name;
			if (parsed.data.email !== undefined)
				update.email = parsed.data.email ?? null;
			if (parsed.data.phone !== undefined)
				update.phone = parsed.data.phone ?? null;
		} else {
			// nutri/clinic_admin/platform_admin
			if (parsed.data.name !== undefined) update.name = parsed.data.name;
			if (parsed.data.email !== undefined)
				update.email = parsed.data.email ?? null;
			if (parsed.data.phone !== undefined)
				update.phone = parsed.data.phone ?? null;
			if (parsed.data.assignedNutriUid !== undefined) {
				if (role === 'nutri') {
					return denyAuthz(
						req,
						res,
						`Nutri ${req.auth!.uid} tried to assign patient ${id}`
					);
				}
				// clinic_admin o platform_admin
				update.assignedNutriUid = parsed.data.assignedNutriUid ?? null;
			}
		}

		await db.collection('patients').doc(id).update(update);

		const freshSnap = await db.collection('patients').doc(id).get();
		const fresh = { ...(freshSnap.data() as PatientDoc), id: freshSnap.id };

		return res.status(200).json({
			success: true,
			message: 'Patient updated',
			data: sanitizePatientForRole(role, fresh),
		});
	}
);

const moveClinicSchema = z
	.object({
		clinicId: z.string().min(1),
		reason: z.string().min(3).optional(),
	})
	.strict();

/**
 * POST /api/patients/:id/move-clinic
 * - SOLO platform_admin
 * - cambia clinicId y registra auditoría en subcolección
 */
patientsRouter.post(
	'/:id/move-clinic',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const db = getFirestoreDb();
		const id = req.params.id ?? '';

		if (!id) {
			return res.status(400).json({
				success: false,
				message: 'Missing patient id',
			});
		}

		const parsed = moveClinicSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const patientRef = db.collection('patients').doc(id);
		const snap = await patientRef.get();
		if (!snap.exists) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}

		const current = snap.data() as any;
		const fromClinicId = current?.clinicId;

		const toClinicId = parsed.data.clinicId;

		if (fromClinicId === toClinicId) {
			return res.status(200).json({
				success: true,
				message: 'No changes',
				data: { id, clinicId: toClinicId },
			});
		}

		const now = Timestamp.now();

		await db.runTransaction(async (tx) => {
			tx.update(patientRef, {
				clinicId: toClinicId,
				updatedAt: now,
			});

			// auditoría: subcolección
			const auditRef = patientRef.collection('audit').doc();
			tx.set(auditRef, {
				action: 'MOVE_CLINIC',
				fromClinicId: fromClinicId ?? null,
				toClinicId,
				byUid: req.auth!.uid,
				byRole: req.auth!.role ?? null,
				reason: parsed.data.reason ?? null,
				at: now,
			});
		});

		const fresh = await patientRef.get();
		return res.status(200).json({
			success: true,
			message: 'Patient clinic moved',
			data: { id, ...(fresh.data() as any) },
		});
	}
);
