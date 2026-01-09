import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

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

async function upsertUserForPatient(
	dni: number,
	name: string,
	email: string | null,
	phone: string | null
) {
	const db = getFirestoreDb();
	const now = Timestamp.now();

	const existing = await db
		.collection('users')
		.where('dni', '==', dni)
		.limit(1)
		.get();

	if (!existing.empty) {
		const userDoc = existing.docs[0];
		if (!userDoc) throw new Error('Unexpected null doc');
		await userDoc.ref.update({
			name,
			email,
			phone,
			updatedAt: now,
		});
		return userDoc.id;
	}

	const ref = db.collection('users').doc();
	await ref.set({
		name,
		email,
		phone,
		dni,
		createdAt: now,
		updatedAt: now,
	});
	return ref.id;
}

const createPatientSchema = z.object({
	name: z.string().min(2),
	dni: z.string().min(7).max(8),
	email: z.string().email().optional().nullable(),
	phone: z.string().min(5).optional().nullable(),
	assignedProfessionalUids: z.array(z.string().min(1)).optional().nullable(),
});

const patchPatientSchema = z.object({
	name: z.string().min(2).optional(),
	dni: z.string().min(7).max(8).optional(),
	email: z.string().email().optional().nullable(),
	phone: z.string().min(5).optional().nullable(),
	assignedProfessionalUids: z.array(z.string().min(1)).optional().nullable(),
	status: z.string().optional(),
});

const assignProfessionalSchema = z.object({
	professionalUid: z.string().min(1).nullable(),
});

function clinicScopedUnlessPlatformAdmin(
	req: Request,
	res: Response,
	next: () => void
) {
	if (req.auth?.isPlatformAdmin) return next();
	return requireClinicContext(req, res, next);
}

// Endpoint Lookup (Búsqueda por DNI)
patientsRouter.get(
	'/lookup',
	requireClinicContext,
	async (req: Request, res: Response) => {
		const dniVal = parseInt(req.query.dni as string, 10);
		if (isNaN(dniVal))
			return res.status(400).json({ success: false, message: 'Invalid DNI' });
		if (dniVal < 1000000 || dniVal > 99999999) {
			return res.status(400).json({
				success: false,
				message: 'DNI must be between 1000000 and 99999999',
			});
		}

		const db = getFirestoreDb();
		// Búsqueda exacta numérica
		const snap = await db
			.collection('patients')
			.where('dni', '==', dniVal)
			.limit(1)
			.get();

		if (snap.empty) {
			return res.status(200).json({ success: true, data: null });
		}

		const doc = snap.docs[0];
		// FIX CRÍTICO: Validación explícita para TS
		if (!doc) {
			return res.status(200).json({ success: true, data: null });
		}

		const data = doc.data() as PatientDoc;

		return res.status(200).json({
			success: true,
			data: {
				id: doc.id,
				name: data.name,
				email: data.email,
				phone: data.phone,
				clinicId: data.clinicId,
				assignedProfessionalUids: data.assignedProfessionalUids,
			},
		});
	}
);

patientsRouter.get(
	'/',
	clinicScopedUnlessPlatformAdmin,
	async (req: Request, res: Response) => {
		const auth = req.auth!;

		const db = getFirestoreDb();
		let clinicId: string | null = auth.clinicId;

		if (auth.isPlatformAdmin) {
			clinicId =
				req.header('x-clinic-id') ??
				(req.query.clinicId as string | undefined) ??
				null;
			if (!clinicId) {
				return res.status(400).json({
					success: false,
					message: 'clinicId is required for platform admin listing',
				});
			}
		}

		if (!clinicId) {
			return denyAuthz(req, res, 'Missing clinicId for clinic listing');
		}

		const query =
			auth.role === 'professional'
				? db
						.collection('patients')
						.where('clinicId', '==', clinicId)
						.where('assignedProfessionalUids', 'array-contains', auth.uid)
				: db.collection('patients').where('clinicId', '==', clinicId);

		const snap = await query.limit(100).get();
		const items = snap.docs.map((d) => ({
			id: d.id,
			...(d.data() as PatientDoc),
		}));

		return res.status(200).json({
			success: true,
			data: items.map((p) =>
				sanitizePatientForRole((auth.role ?? 'platform_admin') as Role, p)
			),
		});
	}
);

patientsRouter.get('/:id', async (req: Request, res: Response) => {
	const auth = req.auth!;
	const patientId = req.params.id;

	if (!patientId) {
		return res
			.status(400)
			.json({ success: false, message: 'Missing patient id' });
	}

	const db = getFirestoreDb();
	const snap = await db.collection('patients').doc(patientId).get();

	if (!snap.exists) {
		return res
			.status(404)
			.json({ success: false, message: 'Patient not found' });
	}

	const patient = { id: snap.id, ...(snap.data() as PatientDoc) };

	let isAllowed = false;

	if (auth.isPlatformAdmin) {
		isAllowed = true;
	} else if (
		auth.role === 'professional' &&
		(patient.assignedProfessionalUids ?? []).includes(auth.uid)
	) {
		isAllowed = true;
	} else {
		// Verificar si el usuario pertenece a la misma clínica que el paciente
		const membershipSnap = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', patient.clinicId)
			.where('uid', '==', auth.uid)
			.where('isActive', '==', true)
			.limit(1)
			.get();

		if (!membershipSnap.empty) {
			const mem = membershipSnap.docs[0]?.data();
			if (mem && ['clinic_admin', 'staff'].includes(mem.role)) {
				isAllowed = true;
			}
		}
	}

	if (!isAllowed) {
		return denyAuthz(
			req,
			res,
			'You do not have permission to view this patient'
		);
	}

	return res.status(200).json({
		success: true,
		data: sanitizePatientForRole(
			(auth.role ?? 'platform_admin') as Role,
			patient
		),
	});
});

patientsRouter.post(
	'/',
	requireClinicContext,
	requireRole('clinic_admin', 'professional', 'staff', 'platform_admin'),
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

		const clinicId = auth.clinicId ?? req.header('x-clinic-id') ?? null;
		if (!clinicId) {
			return denyAuthz(
				req,
				res,
				'Missing clinic context when creating patient'
			);
		}

		const db = getFirestoreDb();
		const dniVal = parseInt(parsed.data.dni, 10);
		if (isNaN(dniVal) || dniVal < 1000000 || dniVal > 99999999) {
			return res.status(400).json({
				success: false,
				message: 'DNI must be between 1000000 and 99999999',
			});
		}

		// FIX: Buscar por valor numérico para evitar duplicados
		const existingDniSnap = await db
			.collection('patients')
			.where('dni', '==', dniVal)
			.limit(1)
			.get();

		if (!existingDniSnap.empty) {
			const existingDoc = existingDniSnap.docs[0]!;
			const existingData = existingDoc.data() as PatientDoc;
			const userId = await upsertUserForPatient(
				dniVal,
				parsed.data.name,
				parsed.data.email ?? null,
				parsed.data.phone ?? null
			);

			const updateData: Partial<PatientDoc> = {
				updatedAt: Timestamp.now(),
				userId,
			};

			const existingProfessionals = existingData.assignedProfessionalUids ?? [];
			if (auth.role === 'professional') {
				updateData.assignedProfessionalUids = Array.from(
					new Set([...existingProfessionals, auth.uid])
				);
			} else if (parsed.data.assignedProfessionalUids) {
				updateData.assignedProfessionalUids = Array.from(
					new Set([
						...existingProfessionals,
						...parsed.data.assignedProfessionalUids,
					])
				);
			}

			if (existingData.clinicId !== clinicId) {
				updateData.clinicId = clinicId;
			}

			await existingDoc.ref.update(updateData);

			logEvent('patient_reassigned', {
				req,
				clinicId,
				data: { patientId: existingDoc.id, dni: dniVal },
			});

			return res.status(200).json({
				success: true,
				message:
					'Patient exists. Reassigned to current clinic and professional.',
				data: sanitizePatientForRole((auth.role ?? 'platform_admin') as Role, {
					id: existingDoc.id,
					...existingData,
					...updateData,
				}),
			});
		}

		const userId = await upsertUserForPatient(
			dniVal,
			parsed.data.name,
			parsed.data.email ?? null,
			parsed.data.phone ?? null
		);

		const assignedProfessionalUids =
			auth.role === 'professional'
				? [auth.uid]
				: (parsed.data.assignedProfessionalUids ?? []);

		const now = Timestamp.now();
		const doc: PatientDoc = {
			clinicId,
			assignedProfessionalUids,
			userId,
			name: parsed.data.name,
			dni: dniVal,
			email: parsed.data.email ?? null,
			phone: parsed.data.phone ?? null,
			linkedUid: null,
			status: 'active',
			createdAt: now,
			updatedAt: now,
		};

		const ref = db.collection('patients').doc();
		await ref.set(doc);

		const created = { id: ref.id, ...doc };
		logEvent('patient_created', { req, clinicId, data: { patientId: ref.id } });

		return res.status(201).json({
			success: true,
			message: 'Patient created',
			data: sanitizePatientForRole(
				(auth.role ?? 'platform_admin') as Role,
				created
			),
		});
	}
);

patientsRouter.patch(
	'/:id',
	clinicScopedUnlessPlatformAdmin,
	requireRole('clinic_admin', 'professional', 'staff', 'platform_admin'),
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
		const clinicIdHeader = auth.isPlatformAdmin
			? req.header('x-clinic-id')
			: auth.clinicId;
		const clinicId = clinicIdHeader ?? null;
		const patientId = req.params.id;

		if (!patientId) {
			return res
				.status(400)
				.json({ success: false, message: 'Missing patient id' });
		}

		let current: (PatientDoc & { id: string }) | null = null;
		if (auth.isPlatformAdmin && clinicId === null) {
			const snap = await db.collection('patients').doc(patientId).get();
			if (snap.exists) {
				current = { id: snap.id, ...(snap.data() as PatientDoc) };
			}
		} else if (clinicId) {
			current = await getDocInClinic<PatientDoc>(
				db,
				'patients',
				patientId,
				clinicId
			);
		}

		if (!current) {
			return res
				.status(404)
				.json({ success: false, message: 'Patient not found' });
		}

		const update: Partial<PatientDoc> = { updatedAt: Timestamp.now() };
		const nextName = parsed.data.name ?? current.name;
		const nextEmail =
			parsed.data.email !== undefined ? parsed.data.email ?? null : current.email;
		const nextPhone =
			parsed.data.phone !== undefined ? parsed.data.phone ?? null : current.phone;
		if (parsed.data.name !== undefined) update.name = parsed.data.name;
		if (parsed.data.dni !== undefined) {
			const parsedDni = parseInt(parsed.data.dni, 10);
			if (isNaN(parsedDni) || parsedDni < 1000000 || parsedDni > 99999999) {
				return res.status(400).json({
					success: false,
					message: 'DNI must be between 1000000 and 99999999',
				});
			}
			const existingDni = await db
				.collection('patients')
				.where('dni', '==', parsedDni)
				.limit(1)
				.get();
			const conflictingDoc = existingDni.docs.find((doc) => doc.id !== patientId);
			if (conflictingDoc) {
				return res.status(400).json({
					success: false,
					message: 'DNI already exists for another patient',
				});
			}
			update.dni = parsedDni;
		}
		if (parsed.data.email !== undefined)
			update.email = parsed.data.email ?? null;
		if (parsed.data.phone !== undefined)
			update.phone = parsed.data.phone ?? null;
		if (parsed.data.assignedProfessionalUids !== undefined) {
			update.assignedProfessionalUids =
				auth.role === 'professional'
					? [auth.uid]
					: parsed.data.assignedProfessionalUids ?? [];
		}
		if (parsed.data.status !== undefined && auth.role !== 'staff') {
			update.status = parsed.data.status as
				| 'active'
				| 'inactive'
				| 'discharged';
		}

		if (
			parsed.data.name !== undefined ||
			parsed.data.email !== undefined ||
			parsed.data.phone !== undefined ||
			parsed.data.dni !== undefined
		) {
			const dniToUse = update.dni ?? current.dni;
			update.userId = await upsertUserForPatient(
				dniToUse,
				nextName,
				nextEmail,
				nextPhone
			);
		}

		await db.collection('patients').doc(patientId).update(update);

		const freshSnap = await db.collection('patients').doc(patientId).get();
		const fresh = { id: freshSnap.id, ...(freshSnap.data() as PatientDoc) };

		return res.status(200).json({
			success: true,
			message: 'Patient updated',
			data: sanitizePatientForRole(
				(auth.role ?? 'platform_admin') as Role,
				fresh
			),
		});
	}
);

patientsRouter.post(
	'/:id/assign-professional',
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'platform_admin', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId;
		if (!clinicId)
			return denyAuthz(req, res, 'Missing clinic context on assign');

		const patientId = req.params.id;
		if (!patientId)
			return res
				.status(400)
				.json({ success: false, message: 'Missing patient id' });

		if (auth.role === 'professional') {
			req.body.professionalUid = auth.uid;
		}

		const parsed = assignProfessionalSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(
			db,
			'patients',
			patientId,
			clinicId
		);
		if (!patient) {
			return res
				.status(404)
				.json({ success: false, message: 'Patient not found in clinic' });
		}

		const professionalUid = parsed.data.professionalUid;
		if (professionalUid) {
			const membership = await db
				.collection('clinic_memberships')
				.where('clinicId', '==', clinicId)
				.where('uid', '==', professionalUid)
				.where('role', '==', 'professional')
				.where('isActive', '==', true)
				.limit(1)
				.get();

			if (membership.empty) {
				return res.status(400).json({
					success: false,
					message:
						'professionalUid is not an active professional in this clinic',
				});
			}
		}

		const updatedProfessionals = professionalUid
			? Array.from(
					new Set([
						...(patient.assignedProfessionalUids ?? []),
						professionalUid,
					])
				)
			: [];

		await db
			.collection('patients')
			.doc(patientId)
			.update({
				assignedProfessionalUids: updatedProfessionals,
				updatedAt: Timestamp.now(),
			});

		return res.status(200).json({
			success: true,
			message: 'Patient assigned',
			data: { id: patientId, assignedProfessionalUids: updatedProfessionals },
		});
	}
);
