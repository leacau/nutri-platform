import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { getFirebaseAdmin } from '../firebase/admin.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { analyzeUserSession } from '../middlewares/resolveSessionContext.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicDoc, ClinicMembershipDoc } from '../types/clinics.js';
import type { ClinicRole, Role } from '../types/auth.js';

const router = Router();
const adminRouter = Router();

// --- CONFIGURACIÓN DE NODEMAILER (GMAIL) ---
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER || 'tu_correo_de_prueba@gmail.com',
		pass: process.env.EMAIL_PASS || 'tu_contraseña_de_aplicacion',
	},
});

async function safeSendMail(
	options: Parameters<typeof transporter.sendMail>[0],
) {
	if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
		console.warn(
			'[invite-email] EMAIL_USER/EMAIL_PASS missing; skipping email delivery',
		);
		return false;
	}

	try {
		await transporter.sendMail(options);
		return true;
	} catch (error) {
		console.warn('[invite-email] Email delivery failed; invitation continues', {
			error: error instanceof Error ? error.message : error,
		});
		return false;
	}
}

const inviteMemberSchema = z.object({
	name: z.string().min(2),
	email: z.string().email(),
	dni: z.string().min(7).max(8),
	role: z.enum(['clinic_admin', 'professional', 'staff']),
});

const createClinicSchema = z.object({
	name: z.string().min(2),
	admin: z.object({
		name: z.string().min(2),
		email: z.string().email(),
		dni: z.string().min(7).max(8),
	}),
});

const updateClinicSchema = z
	.object({
		name: z.string().min(2).optional(),
		isActive: z.boolean().optional(),
	})
	.refine((data) => data.name !== undefined || data.isActive !== undefined, {
		message: 'At least one field is required',
	});

const clinicSettingsSchema = z.object({
	name: z.string().min(2).optional(),
	branding: z
		.object({
			logoUrl: z.string().url().optional().nullable(),
			accentColor: z.string().min(4).max(32).optional().nullable(),
		})
		.optional(),
	reminderPreferences: z
		.object({
			whatsappEnabled: z.boolean().optional(),
			emailEnabled: z.boolean().optional(),
		})
		.optional(),
	patientAppointmentSelfService: z
		.object({
			canCancel: z.boolean().optional(),
			canReschedule: z.boolean().optional(),
			minHoursBefore: z.number().int().min(0).max(720).optional(),
		})
		.optional(),
});

const adminMemberSchema = z.object({
	uid: z.string().min(1),
	role: z.enum(['clinic_admin', 'professional', 'staff']),
	isActive: z.boolean().optional(),
});

const updateAdminMemberSchema = z
	.object({
		role: z.enum(['clinic_admin', 'professional', 'staff']).optional(),
		isActive: z.boolean().optional(),
	})
	.refine((data) => data.role !== undefined || data.isActive !== undefined, {
		message: 'At least one field is required',
	});

type CreateClinicInput = z.infer<typeof createClinicSchema>;

function canManageClinicMemberRole(
	actorRole: string | null | undefined,
	targetRole: ClinicRole,
	isPlatformAdmin: boolean | undefined,
) {
	if (isPlatformAdmin || actorRole === 'platform_admin') return true;
	if (actorRole === 'clinic_admin') {
		return targetRole === 'professional' || targetRole === 'staff';
	}
	if (actorRole === 'staff') return targetRole === 'professional';
	return false;
}

function serializeTimestamp(value: unknown): string | null {
	if (value instanceof Timestamp) return value.toDate().toISOString();
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'string') return value;
	return null;
}

function serializeClinic(id: string, data: Partial<ClinicDoc>) {
	return {
		id,
		name: data.name ?? '',
		createdAt: serializeTimestamp(data.createdAt),
		updatedAt: serializeTimestamp(data.updatedAt),
		isActive: data.isActive !== false,
	};
}

async function sendInviteEmail(email: string, name: string, subject: string) {
	const { auth } = getFirebaseAdmin();
	const inviteLink = await auth.generatePasswordResetLink(email);

	try {
		await safeSendMail({
			from: '"Nutri Platform" <no-reply@nutriplatform.com>',
			to: email,
			subject,
			html: `
				<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
					<h2 style="color: #2F8F7B;">Hola, ${name}</h2>
					<p>Tu clinica ha sido configurada exitosamente.</p>
					<p>Hace clic en el boton para establecer tu contrasena y comenzar a gestionar tu espacio:</p>
					<div style="text-align: center; margin: 30px 0;">
						<a href="${inviteLink}" style="background-color: #2F8F7B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Establecer contrasena</a>
					</div>
				</div>
			`,
		});
	} catch (error) {
		console.warn('[invite-email] Email delivery failed; invite link still generated', {
			email,
			error: error instanceof Error ? error.message : error,
		});
	}

	return inviteLink;
}

async function resolveOrCreateClinicAdmin(
	input: CreateClinicInput,
	now: Timestamp,
): Promise<string> {
	const db = getFirestoreDb();
	const { auth } = getFirebaseAdmin();
	const dniInt = parseInt(input.admin.dni, 10);

	if (dniInt < 1000000 || dniInt > 99999999) {
		throw new Error('DNI_RANGE');
	}

	const userSnap = await db
		.collection('users')
		.where('dni', '==', dniInt)
		.limit(1)
		.get();

	if (!userSnap.empty) {
		const userDoc = userSnap.docs[0];
		if (!userDoc) throw new Error('Unexpected null doc');
		const uid = userDoc.id;

		try {
			await auth.getUser(uid);
		} catch (error: any) {
			if (error.code !== 'auth/user-not-found') throw error;

			try {
				const randomPassword = crypto.randomBytes(20).toString('hex');
				await auth.createUser({
					uid,
					email: input.admin.email,
					displayName: input.admin.name,
					password: randomPassword,
				});
				await sendInviteEmail(
					input.admin.email,
					input.admin.name,
					'Bienvenido a tu nueva clinica en Nutri Platform!',
				);
			} catch (createErr: any) {
				console.error('No se pudo sanar al usuario:', createErr.message);
			}
		}

		await userDoc.ref.update({
			name: input.admin.name,
			email: input.admin.email,
			updatedAt: now,
		});

		return uid;
	}

	let uid: string;
	try {
		const randomPassword = crypto.randomBytes(20).toString('hex');
		const userRecord = await auth.createUser({
			email: input.admin.email,
			displayName: input.admin.name,
			password: randomPassword,
		});
		uid = userRecord.uid;
		await sendInviteEmail(
			input.admin.email,
			input.admin.name,
			'Bienvenido a tu nueva clinica en Nutri Platform!',
		);
	} catch (error: any) {
		if (error.code !== 'auth/email-already-exists') throw error;
		const existingUser = await auth.getUserByEmail(input.admin.email);
		uid = existingUser.uid;
	}

	await db.collection('users').doc(uid).set(
		{
			email: input.admin.email,
			dni: dniInt,
			name: input.admin.name,
			createdAt: now,
			updatedAt: now,
		},
		{ merge: true },
	);

	return uid;
}

async function createClinicWithAdmin(input: CreateClinicInput, creatorUid: string) {
	const db = getFirestoreDb();
	const now = Timestamp.now();
	const adminUid = await resolveOrCreateClinicAdmin(input, now);
	const clinicRef = db.collection('clinics').doc();
	const clinicDoc: ClinicDoc = {
		name: input.name,
		isActive: true,
		createdAt: now,
		updatedAt: now,
	};

	await clinicRef.set(clinicDoc);

	await db.collection('clinic_memberships').add({
		clinicId: clinicRef.id,
		uid: adminUid,
		role: 'clinic_admin',
		isActive: true,
		createdAt: now,
		updatedAt: now,
		createdByUid: creatorUid,
	});

	console.info('[clinics:create]', {
		clinicId: clinicRef.id,
		createdByUid: creatorUid,
	});

	return {
		...serializeClinic(clinicRef.id, clinicDoc),
		clinicId: clinicRef.id,
		adminUid,
	};
}

async function hasActiveClinicMembership(uid: string, clinicId: string) {
	const db = getFirestoreDb();
	const snap = await db
		.collection('clinic_memberships')
		.where('clinicId', '==', clinicId)
		.where('uid', '==', uid)
		.where('isActive', '==', true)
		.limit(1)
		.get();

	return !snap.empty;
}

const HARD_DELETE_CLINIC_COLLECTIONS = [
	'clinic_memberships',
	'appointments',
	'clinical_records',
	'metrics',
	'visits',
	'notes',
	'plans',
	'measurement_templates',
] as const;

async function ensureClinicExists(clinicId: string) {
	const db = getFirestoreDb();
	const clinicSnap = await db.collection('clinics').doc(clinicId).get();
	return clinicSnap.exists ? clinicSnap : null;
}

async function deleteQueryInBatches(query: any) {
	let deleted = 0;
	while (true) {
		const snap = await query.limit(450).get();
		if (snap.empty) return deleted;
		const batch = getFirestoreDb().batch();
		snap.docs.forEach((doc: any) => batch.delete(doc.ref));
		await batch.commit();
		deleted += snap.size;
	}
}

async function hardDeleteClinicData(clinicId: string) {
	const db = getFirestoreDb();
	const deleted: Record<string, number> = {};
	const patientsSnap = await db
		.collection('patients')
		.where('clinicId', '==', clinicId)
		.get();
	const patientIds = patientsSnap.docs.map((doc) => doc.id);

	if (!patientsSnap.empty) {
		const batch = db.batch();
		patientsSnap.docs.forEach((doc) => batch.delete(doc.ref));
		await batch.commit();
	}
	deleted.patients = patientsSnap.size;

	let deletedProfiles = 0;
	for (let i = 0; i < patientIds.length; i += 450) {
		const batch = db.batch();
		const ids = patientIds.slice(i, i + 450);
		ids.forEach((patientId) => {
			batch.delete(db.collection('patient_profiles').doc(patientId));
		});
		await batch.commit();
		deletedProfiles += ids.length;
	}
	deleted.patient_profiles = deletedProfiles;

	for (const collectionName of HARD_DELETE_CLINIC_COLLECTIONS) {
		deleted[collectionName] = await deleteQueryInBatches(
			db.collection(collectionName).where('clinicId', '==', clinicId),
		);
	}

	await db.collection('clinics').doc(clinicId).delete();
	deleted.clinics = 1;
	return deleted;
}
router.get('/', authMiddleware, async (req: Request, res: Response) => {
	const auth = req.auth!;
	const db = getFirestoreDb();

	if (auth.isPlatformAdmin) {
		const snap = await db
			.collection('clinics')
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();

		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
		return res.status(200).json({ success: true, data: items });
	}

	const membershipsSnap = await db
		.collection('clinic_memberships')
		.where('uid', '==', auth.uid)
		.where('isActive', '==', true)
		.get();

	if (membershipsSnap.empty) {
		return res.status(200).json({ success: true, data: [] });
	}

	const memberships = membershipsSnap.docs.map(
		(d) => d.data() as ClinicMembershipDoc,
	);

	const clinicIds = Array.from(
		new Set(memberships.map((m) => m.clinicId).filter(Boolean)),
	);

	const refs = clinicIds.map((id) => db.collection('clinics').doc(id));
	const clinicDocs = refs.length ? await db.getAll(...refs) : [];

	const clinics = clinicDocs
		.filter((d) => d.exists && ((d.data() as ClinicDoc | undefined)?.isActive !== false))
		.map((d) => {
			const data = d.data() as any;
			const membership = memberships.find((m) => m.clinicId === d.id) ?? null;
			return {
				id: d.id,
				name: data?.name ?? null,
				createdAt: data?.createdAt ?? null,
				updatedAt: data?.updatedAt ?? null,
				role: membership?.role ?? null,
			};
		});

	return res.status(200).json({ success: true, data: clinics });
});

router.get(
	'/lookup-user',
	authMiddleware,
	async (req: Request, res: Response) => {
		const dniStr = req.query.dni as string;
		if (!dniStr)
			return res.status(400).json({ success: false, message: 'Missing dni' });

		const dni = parseInt(dniStr, 10);
		if (isNaN(dni))
			return res.status(400).json({ success: false, message: 'Invalid dni' });
		if (dni < 1000000 || dni > 99999999) {
			return res.status(400).json({
				success: false,
				message: 'DNI must be between 1000000 and 99999999',
			});
		}

		const db = getFirestoreDb();
		const snap = await db
			.collection('users')
			.where('dni', '==', dni)
			.limit(1)
			.get();

		if (snap.empty) {
			return res.status(200).json({ success: true, data: null });
		}

		const d = snap.docs[0];
		if (!d) {
			return res.status(200).json({ success: true, data: null });
		}

		const data = d.data();

		return res.status(200).json({
			success: true,
			data: {
				uid: d.id,
				name: data.name,
				email: data.email,
				dni: data.dni,
			},
		});
	},
);

adminRouter.get(
	'/',
	authMiddleware,
	requireRole('platform_admin'),
	async (_req: Request, res: Response) => {
		const db = getFirestoreDb();
		const snap = await db.collection('clinics').orderBy('createdAt', 'desc').get();
		const clinics = snap.docs.map((doc) =>
			serializeClinic(doc.id, doc.data() as ClinicDoc),
		);

		return res.status(200).json({ success: true, data: clinics });
	},
);

adminRouter.post(
	'/',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const parsed = createClinicSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		try {
			const clinic = await createClinicWithAdmin(parsed.data, req.auth!.uid);
			return res.status(201).json({
				success: true,
				message: 'Clinic created',
				data: clinic,
			});
		} catch (error: any) {
			if (error.message === 'DNI_RANGE') {
				return res.status(400).json({
					success: false,
					message: 'DNI must be between 1000000 and 99999999',
				});
			}
			throw error;
		}
	},
);
adminRouter.patch(
	'/:clinicId',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId) {
			return res.status(400).json({ success: false, message: 'Missing clinicId' });
		}

		const parsed = updateClinicSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const clinicSnap = await ensureClinicExists(clinicId);
		if (!clinicSnap) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}

		const update: Partial<ClinicDoc> = { updatedAt: Timestamp.now() };
		if (parsed.data.name !== undefined) update.name = parsed.data.name;
		if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;

		await clinicSnap.ref.update(update);
		const fresh = await clinicSnap.ref.get();
		console.info('[admin:clinics:update]', {
			clinicId,
			uid: req.auth?.uid,
			changes: Object.keys(parsed.data),
		});

		return res.status(200).json({
			success: true,
			data: serializeClinic(fresh.id, fresh.data() as ClinicDoc),
		});
	},
);

adminRouter.delete(
	'/:clinicId',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId) {
			return res.status(400).json({ success: false, message: 'Missing clinicId' });
		}

		const clinicSnap = await ensureClinicExists(clinicId);
		if (!clinicSnap) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}

		const deleted = await hardDeleteClinicData(clinicId);
		console.warn('[admin:clinics:hard_delete]', {
			clinicId,
			uid: req.auth?.uid,
			deleted,
		});

		return res.status(200).json({ success: true, data: { id: clinicId, deleted } });
	},
);

adminRouter.get(
	'/:clinicId/members',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId) {
			return res.status(400).json({ success: false, message: 'Missing clinicId' });
		}

		const clinicSnap = await ensureClinicExists(clinicId);
		if (!clinicSnap) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}

		const db = getFirestoreDb();
		const snap = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.get();

		const members = await Promise.all(
			snap.docs.map(async (doc) => {
				const member = doc.data() as ClinicMembershipDoc;
				const userSnap = await db.collection('users').doc(member.uid).get();
				const userData = userSnap.exists ? userSnap.data() : {};
				return {
					id: doc.id,
					clinicId,
					uid: member.uid,
					role: member.role,
					isActive: member.isActive !== false,
					name: userData?.name ?? 'Usuario',
					email: userData?.email ?? 'sin-email',
					createdAt: serializeTimestamp(member.createdAt),
					updatedAt: serializeTimestamp(member.updatedAt),
				};
			}),
		);

		return res.status(200).json({ success: true, data: members });
	},
);

adminRouter.post(
	'/:clinicId/members',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId) {
			return res.status(400).json({ success: false, message: 'Missing clinicId' });
		}

		const parsed = adminMemberSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const clinicSnap = await ensureClinicExists(clinicId);
		if (!clinicSnap) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}

		const db = getFirestoreDb();
		const userSnap = await db.collection('users').doc(parsed.data.uid).get();
		if (!userSnap.exists) {
			return res.status(404).json({ success: false, message: 'User not found' });
		}

		const now = Timestamp.now();
		const existing = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.where('uid', '==', parsed.data.uid)
			.limit(1)
			.get();

		if (!existing.empty) {
			const doc = existing.docs[0]!;
			await doc.ref.update({
				role: parsed.data.role,
				isActive: parsed.data.isActive ?? true,
				updatedAt: now,
			});
			return res.status(200).json({
				success: true,
				data: {
					id: doc.id,
					clinicId,
					uid: parsed.data.uid,
					role: parsed.data.role,
					isActive: parsed.data.isActive ?? true,
				},
			});
		}

		const doc: ClinicMembershipDoc = {
			clinicId,
			uid: parsed.data.uid,
			role: parsed.data.role,
			isActive: parsed.data.isActive ?? true,
			createdAt: now,
			updatedAt: now,
			createdByUid: req.auth?.uid ?? null,
		};
		const ref = db.collection('clinic_memberships').doc();
		await ref.set(doc);
		return res.status(201).json({ success: true, data: { id: ref.id, ...doc } });
	},
);

adminRouter.patch(
	'/:clinicId/members/:membershipId',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const { clinicId, membershipId } = req.params;
		if (!clinicId || !membershipId) {
			return res.status(400).json({ success: false, message: 'Missing params' });
		}

		const parsed = updateAdminMemberSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const db = getFirestoreDb();
		const ref = db.collection('clinic_memberships').doc(membershipId);
		const snap = await ref.get();
		if (!snap.exists || (snap.data() as ClinicMembershipDoc).clinicId !== clinicId) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}

		const update: Partial<ClinicMembershipDoc> = { updatedAt: Timestamp.now() };
		if (parsed.data.role !== undefined) update.role = parsed.data.role;
		if (parsed.data.isActive !== undefined) update.isActive = parsed.data.isActive;
		await ref.update(update);

		return res.status(200).json({
			success: true,
			data: { id: membershipId, ...(snap.data() as ClinicMembershipDoc), ...parsed.data },
		});
	},
);

adminRouter.delete(
	'/:clinicId/members/:membershipId',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const { clinicId, membershipId } = req.params;
		if (!clinicId || !membershipId) {
			return res.status(400).json({ success: false, message: 'Missing params' });
		}

		const db = getFirestoreDb();
		const ref = db.collection('clinic_memberships').doc(membershipId);
		const snap = await ref.get();
		if (!snap.exists || (snap.data() as ClinicMembershipDoc).clinicId !== clinicId) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}

		await ref.delete();
		return res.status(200).json({ success: true, data: { id: membershipId } });
	},
);

router.post(
	'/',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const parsed = createClinicSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		try {
			const clinic = await createClinicWithAdmin(parsed.data, req.auth!.uid);
			return res.status(201).json({
				success: true,
				message: 'Clinic created',
				data: clinic,
			});
		} catch (error: any) {
			if (error.message === 'DNI_RANGE') {
				return res.status(400).json({
					success: false,
					message: 'DNI must be between 1000000 and 99999999',
				});
			}
			throw error;
		}

	},
);

router.get('/mine', authMiddleware, async (req: Request, res: Response) => {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	const xClinicId = req.header('x-clinic-id') as string | undefined;
	const analysis = await analyzeUserSession(
		req.auth.uid,
		xClinicId,
		req.auth.isPlatformAdmin,
	);

	const clinics: Array<{
		clinicId: string;
		role: Role;
		clinicName: string | null;
		patientId?: string;
	}> = [
		...analysis.staffClinics,
		...analysis.patientClinics.map((clinic) => ({
			clinicId: clinic.clinicId,
			role: 'patient' as Role,
			clinicName: clinic.clinicName,
			patientId: clinic.patientId,
		})),
	];

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

router.get('/:clinicId', authMiddleware, async (req: Request, res: Response) => {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	const clinicId = req.params.clinicId;
	if (!clinicId) {
		return res.status(400).json({ success: false, message: 'Missing clinicId' });
	}

	const db = getFirestoreDb();
	const clinicSnap = await db.collection('clinics').doc(clinicId).get();

	if (!clinicSnap.exists) {
		console.warn('[clinics:get:not_found]', {
			clinicId,
			uid: req.auth.uid,
			isPlatformAdmin: req.auth.isPlatformAdmin,
		});
		return res.status(404).json({ success: false, message: 'Not found' });
	}

	const clinicData = clinicSnap.data() as ClinicDoc;

	if (!req.auth.isPlatformAdmin) {
		if (clinicData.isActive === false) {
			return res.status(403).json({ success: false, message: 'Clinic inactive' });
		}

		if (req.auth.role === 'patient') {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		const isMember = await hasActiveClinicMembership(req.auth.uid, clinicId);
		if (!isMember) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}
	}

	return res.status(200).json({
		success: true,
		data: serializeClinic(clinicSnap.id, clinicData),
	});
});

router.get(
	'/:clinicId/settings',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId || req.auth?.clinicId !== clinicId) {
			return res.status(400).json({ success: false, message: 'Invalid clinicId' });
		}

		const clinicSnap = await ensureClinicExists(clinicId);
		if (!clinicSnap) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}

		const data = clinicSnap.data() as ClinicDoc;
		return res.status(200).json({
			success: true,
			data: {
				name: data.name,
				branding: data.branding ?? null,
				reminderPreferences: data.reminderPreferences ?? null,
				patientAppointmentSelfService:
					data.patientAppointmentSelfService ?? {
						canCancel: true,
						canReschedule: false,
						minHoursBefore: 24,
					},
			},
		});
	},
);

router.patch(
	'/:clinicId/settings',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId || req.auth?.clinicId !== clinicId) {
			return res.status(400).json({ success: false, message: 'Invalid clinicId' });
		}

		const parsed = clinicSettingsSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const clinicSnap = await ensureClinicExists(clinicId);
		if (!clinicSnap) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}

		const update: Partial<ClinicDoc> = { updatedAt: Timestamp.now() };
		if (parsed.data.name !== undefined) update.name = parsed.data.name;
		if (parsed.data.branding !== undefined) {
			const branding: ClinicDoc['branding'] = {};
			if (parsed.data.branding.logoUrl !== undefined) {
				branding.logoUrl = parsed.data.branding.logoUrl;
			}
			if (parsed.data.branding.accentColor !== undefined) {
				branding.accentColor = parsed.data.branding.accentColor;
			}
			update.branding = branding;
		}
		if (parsed.data.reminderPreferences !== undefined) {
			const reminderPreferences: ClinicDoc['reminderPreferences'] = {};
			if (parsed.data.reminderPreferences.whatsappEnabled !== undefined) {
				reminderPreferences.whatsappEnabled =
					parsed.data.reminderPreferences.whatsappEnabled;
			}
			if (parsed.data.reminderPreferences.emailEnabled !== undefined) {
				reminderPreferences.emailEnabled =
					parsed.data.reminderPreferences.emailEnabled;
			}
			update.reminderPreferences = reminderPreferences;
		}
		if (parsed.data.patientAppointmentSelfService !== undefined) {
			const patientAppointmentSelfService: ClinicDoc['patientAppointmentSelfService'] =
				{};
			if (
				parsed.data.patientAppointmentSelfService.canCancel !== undefined
			) {
				patientAppointmentSelfService.canCancel =
					parsed.data.patientAppointmentSelfService.canCancel;
			}
			if (
				parsed.data.patientAppointmentSelfService.canReschedule !==
				undefined
			) {
				patientAppointmentSelfService.canReschedule =
					parsed.data.patientAppointmentSelfService.canReschedule;
			}
			if (
				parsed.data.patientAppointmentSelfService.minHoursBefore !==
				undefined
			) {
				patientAppointmentSelfService.minHoursBefore =
					parsed.data.patientAppointmentSelfService.minHoursBefore;
			}
			update.patientAppointmentSelfService = patientAppointmentSelfService;
		}
		await clinicSnap.ref.set(update, { merge: true });
		const fresh = await clinicSnap.ref.get();
		const data = fresh.data() as ClinicDoc;

		return res.status(200).json({
			success: true,
			data: {
				name: data.name,
				branding: data.branding ?? null,
				reminderPreferences: data.reminderPreferences ?? null,
				patientAppointmentSelfService:
					data.patientAppointmentSelfService ?? null,
			},
		});
	},
);

const upsertMemberBody = z.object({
	uid: z.string().min(1),
	role: z.enum(['clinic_admin', 'professional', 'staff']),
	isActive: z.boolean().optional(),
});

router.post(
	'/:clinicId/members',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin', 'staff'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId)
			return res
				.status(400)
				.json({ success: false, message: 'Missing clinicId' });

		const parsed = upsertMemberBody.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		if (
			!canManageClinicMemberRole(
				req.auth?.role,
				parsed.data.role,
				req.auth?.isPlatformAdmin,
			)
		) {
			return res.status(403).json({
				success: false,
				message: 'You cannot assign this role',
			});
		}

		const db = getFirestoreDb();
		const now = Timestamp.now();

		const existing = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.where('uid', '==', parsed.data.uid)
			.limit(1)
			.get();

		if (existing.empty) {
			const doc: ClinicMembershipDoc = {
				clinicId,
				uid: parsed.data.uid,
				role: parsed.data.role,
				isActive: parsed.data.isActive ?? true,
				createdAt: now,
				updatedAt: now,
				createdByUid: req.auth?.uid ?? null,
			};
			const ref = db.collection('clinic_memberships').doc();
			await ref.set(doc);
			return res.status(201).json({
				success: true,
				message: 'Member added',
				data: { id: ref.id, ...doc },
			});
		}

		const doc = existing.docs[0];
		if (doc) {
			await db
				.collection('clinic_memberships')
				.doc(doc.id)
				.update({
					role: parsed.data.role,
					isActive: parsed.data.isActive ?? true,
					updatedAt: now,
				});
			return res.status(200).json({
				success: true,
				message: 'Member updated',
				data: {
					id: doc.id,
					...(doc.data() as ClinicMembershipDoc),
					...parsed.data,
					updatedAt: now,
				},
			});
		}
		return res.status(500).json({ success: false });
	},
);

router.post(
	'/:clinicId/invite',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin', 'staff'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId)
			return res
				.status(400)
				.json({ success: false, message: 'Missing clinicId' });

		const parsed = inviteMemberSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Datos inválidos',
				errors: parsed.error.flatten(),
			});
		}

		if (
			!canManageClinicMemberRole(
				req.auth?.role,
				parsed.data.role,
				req.auth?.isPlatformAdmin,
			)
		) {
			return res.status(403).json({
				success: false,
				message: 'You cannot invite this role',
			});
		}

		const db = getFirestoreDb();
		const dniInt = parseInt(parsed.data.dni, 10);
		if (dniInt < 1000000 || dniInt > 99999999) {
			return res.status(400).json({
				success: false,
				message: 'DNI must be between 1000000 and 99999999',
			});
		}

		const userSnap = await db
			.collection('users')
			.where('dni', '==', dniInt)
			.limit(1)
			.get();

		let uid: string;
		const now = Timestamp.now();
		const { auth } = getFirebaseAdmin();

		if (!userSnap.empty) {
			const userDoc = userSnap.docs[0];
			if (!userDoc) throw new Error('Unexpected null doc');
			uid = userDoc.id;

			try {
				await auth.getUser(uid);
			} catch (error: any) {
				if (error.code === 'auth/user-not-found') {
					try {
						const randomPassword = crypto.randomBytes(20).toString('hex');
						await auth.createUser({
							uid: uid,
							email: parsed.data.email,
							displayName: parsed.data.name,
							password: randomPassword,
						});
						const inviteLink = await auth.generatePasswordResetLink(
							parsed.data.email,
						);

						await safeSendMail({
							from: '"Nutri Platform" <no-reply@nutriplatform.com>',
							to: parsed.data.email,
							subject: '¡Te han invitado a Nutri Platform!',
							html: `
								<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
									<h2 style="color: #2F8F7B;">¡Hola, ${parsed.data.name}!</h2>
									<p>Te han invitado a unirte como ${parsed.data.role} en Nutri Platform.</p>
									<p>Haz clic en el botón para aceptar la invitación y establecer tu contraseña:</p>
									<div style="text-align: center; margin: 30px 0;">
										<a href="${inviteLink}" style="background-color: #2F8F7B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Aceptar Invitación</a>
									</div>
								</div>
							`,
						});
					} catch (createErr: any) {
						console.error('Error sanando y enviando email:', createErr.message);
					}
				}
			}

			await userDoc.ref.update({
				name: parsed.data.name,
				email: parsed.data.email,
				updatedAt: now,
			});
		} else {
			try {
				const randomPassword = crypto.randomBytes(20).toString('hex');
				const userRecord = await auth.createUser({
					email: parsed.data.email,
					displayName: parsed.data.name,
					password: randomPassword,
				});
				uid = userRecord.uid;

				const inviteLink = await auth.generatePasswordResetLink(
					parsed.data.email,
				);

				await safeSendMail({
					from: '"Nutri Platform" <no-reply@nutriplatform.com>',
					to: parsed.data.email,
					subject: '¡Te han invitado a Nutri Platform!',
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
							<h2 style="color: #2F8F7B;">¡Hola, ${parsed.data.name}!</h2>
							<p>Te han invitado a unirte como ${parsed.data.role} en Nutri Platform.</p>
							<p>Haz clic en el botón para aceptar la invitación y establecer tu contraseña:</p>
							<div style="text-align: center; margin: 30px 0;">
								<a href="${inviteLink}" style="background-color: #2F8F7B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Aceptar Invitación</a>
							</div>
						</div>
					`,
				});
			} catch (error: any) {
				if (error.code === 'auth/email-already-exists') {
					const existingUser = await auth.getUserByEmail(parsed.data.email);
					uid = existingUser.uid;
				} else {
					throw error;
				}
			}

			await db.collection('users').doc(uid).set({
				email: parsed.data.email,
				dni: dniInt,
				name: parsed.data.name,
				createdAt: now,
				updatedAt: now,
			});
		}

		const memSnap = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.where('uid', '==', uid)
			.limit(1)
			.get();

		if (!memSnap.empty) {
			const memDoc = memSnap.docs[0];
			if (memDoc) {
				await memDoc.ref.update({
					role: parsed.data.role,
					isActive: true,
					updatedAt: now,
				});
			}
			return res.status(200).json({
				success: true,
				message: 'Usuario existente asignado a la clínica.',
			});
		} else {
			await db.collection('clinic_memberships').add({
				clinicId,
				uid,
				role: parsed.data.role,
				isActive: true,
				createdAt: now,
				updatedAt: now,
				createdByUid: req.auth?.uid,
			});
			return res.status(201).json({
				success: true,
				message: 'Usuario invitado/creado y asignado.',
			});
		}
	},
);

router.get(
	'/:clinicId/professionals',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin', 'staff', 'professional', 'patient'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId || req.auth?.clinicId !== clinicId) {
			return res.status(400).json({ success: false, message: 'Invalid clinicId' });
		}

		const db = getFirestoreDb();
		const snap = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.where('role', '==', 'professional')
			.where('isActive', '==', true)
			.get();

		const professionals = await Promise.all(
			snap.docs.map(async (d) => {
				const m = d.data() as ClinicMembershipDoc;
				const userSnap = await db.collection('users').doc(m.uid).get();
				const userData = userSnap.exists ? userSnap.data() : {};

				return {
					id: d.id,
					clinicId,
					uid: m.uid,
					role: m.role,
					isActive: m.isActive !== false,
					name: userData?.name ?? 'Profesional',
					email: userData?.email ?? null,
				};
			}),
		);

		return res.status(200).json({ success: true, data: professionals });
	},
);

router.get(
	'/:clinicId/members',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin', 'staff'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId)
			return res
				.status(400)
				.json({ success: false, message: 'Missing clinicId' });

		const db = getFirestoreDb();
		const snap = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.where('isActive', '==', true)
			.get();

		const members = await Promise.all(
			snap.docs.map(async (d) => {
				const m = d.data() as ClinicMembershipDoc;
				const userSnap = await db.collection('users').doc(m.uid).get();
				const userData = userSnap.exists ? userSnap.data() : {};

				return {
					id: d.id,
					...m,
					name: userData?.name ?? 'Usuario',
					email: userData?.email ?? 'sin-email',
				};
			}),
		);

		return res.status(200).json({ success: true, data: members });
	},
);

export const clinicsRouter = router;
export const adminClinicsRouter = adminRouter;
