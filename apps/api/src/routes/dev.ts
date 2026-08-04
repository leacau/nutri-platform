import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicMembershipDoc, ClinicDoc } from '../types/clinics.js';
import type { PatientDoc } from '../types/patients.js';
import { getFirebaseAdmin } from '../firebase/admin.js';
import type { ClinicRole, Role } from '../types/auth.js';

const router = Router();

const seedSchema = z.object({
	clinic: z.object({
		clinicId: z.string().optional(),
		name: z.string().min(1),
	}),
	users: z.array(
		z.object({
			uid: z.string().min(1),
			email: z.string().optional().nullable(),
			roleInClinic: z.enum(['clinic_admin', 'professional', 'staff']),
			isActive: z.boolean().optional(),
		})
	),
	patients: z
		.array(
			z.object({
				name: z.string().min(1),
				email: z.string().optional().nullable(),
				phone: z.string().optional().nullable(),
				linkedUid: z.string().optional().nullable(),
				assignedProfessionalUids: z.array(z.string()).optional().nullable(),
			})
		)
		.optional(),
});

router.post('/seed', async (req: Request, res: Response) => {
	try {
		// Validar body
		const parsed = seedSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		console.log('[Seed] Iniciando seed...');
		const db = getFirestoreDb();
		const now = Timestamp.now();
		const clinicId =
			parsed.data.clinic.clinicId ?? db.collection('clinics').doc().id;

		console.log(`[Seed] Creando clínica: ${clinicId}`);
		const clinicDoc: ClinicDoc = {
			name: parsed.data.clinic.name,
			createdAt: now,
			updatedAt: now,
		};
		await db
			.collection('clinics')
			.doc(clinicId)
			.set(clinicDoc, { merge: true });

		const membershipIds: string[] = [];
		for (const u of parsed.data.users) {
			console.log(`[Seed] Procesando usuario: ${u.uid}`);
			const userDoc = {
				email: u.email ?? null,
				displayName: null,
				phone: null,
				createdAt: now,
				updatedAt: now,
			};
			await db.collection('users').doc(u.uid).set(userDoc, { merge: true });

			const existing = await db
				.collection('clinic_memberships')
				.where('clinicId', '==', clinicId)
				.where('uid', '==', u.uid)
				.limit(1)
				.get();

			if (existing.empty) {
				const membership: ClinicMembershipDoc = {
					clinicId,
					uid: u.uid,
					role: u.roleInClinic,
					isActive: u.isActive ?? true,
					createdAt: now,
					updatedAt: now,
					createdByUid: null,
				};
				const ref = db.collection('clinic_memberships').doc();
				await ref.set(membership);
				membershipIds.push(ref.id);
			} else {
				const ref = existing.docs[0]?.ref;
				if (ref) {
					await ref.update({
						role: u.roleInClinic,
						isActive: u.isActive ?? true,
						updatedAt: now,
					});
					membershipIds.push(ref.id);
				}
			}
		}

		const patientIds: string[] = [];
		if (parsed.data.patients?.length) {
			for (const p of parsed.data.patients) {
				console.log(`[Seed] Creando paciente: ${p.name}`);
				const patient: PatientDoc = {
					clinicId,
					name: p.name,
					dni: Math.floor(10000000 + Math.random() * 90000000), // DNI aleatorio de 8 dígitos
					email: p.email ?? null,
					phone: p.phone ?? null,
					linkedUid: p.linkedUid ?? null,
					assignedProfessionalUids: p.assignedProfessionalUids ?? [],
					userId: null,
					status: 'active',
					createdAt: now,
					updatedAt: now,
				};
				const ref = db.collection('patients').doc();
				await ref.set(patient);
				patientIds.push(ref.id);
			}
		}

		console.log('[Seed] Completado con éxito.');
		return res.status(200).json({
			success: true,
			message: 'Seeded',
			data: { clinicId, memberships: membershipIds, patients: patientIds },
		});
	} catch (error) {
		console.error('[Seed] ERROR FATAL:', error);
		// Devolvemos 500 pero NO crasheamos el servidor
		return res.status(500).json({
			success: false,
			message: error instanceof Error ? error.message : 'Unknown seed error',
			stack: error instanceof Error ? error.stack : undefined,
		});
	}
});

type QaUser = {
	uid: string;
	email: string | null;
	name: string;
	roles: Role[];
	clinics: Array<{
		clinicId: string;
		clinicName: string | null;
		role: Role;
		isActive: boolean;
	}>;
};

function addRole(user: QaUser, role: Role) {
	if (!user.roles.includes(role)) user.roles.push(role);
}

router.get('/qa-users', async (_req: Request, res: Response) => {
	const db = getFirestoreDb();
	const users = new Map<string, QaUser>();

	const getOrCreateUser = (uid: string, data?: any): QaUser => {
		const existing = users.get(uid);
		if (existing) return existing;

		const user: QaUser = {
			uid,
			email: data?.email ?? null,
			name: data?.name ?? data?.displayName ?? data?.email ?? uid,
			roles: [],
			clinics: [],
		};
		users.set(uid, user);
		return user;
	};

	const [usersSnap, adminsSnap, membershipsSnap, patientsSnap, clinicsSnap] =
		await Promise.all([
			db.collection('users').get(),
			db.collection('platformAdmins').get(),
			db.collection('clinic_memberships').get(),
			db.collection('patients').get(),
			db.collection('clinics').get(),
		]);

	const clinicNames = new Map<string, string | null>();
	clinicsSnap.forEach((doc) => {
		clinicNames.set(doc.id, (doc.data() as ClinicDoc).name ?? null);
	});

	usersSnap.forEach((doc) => getOrCreateUser(doc.id, doc.data()));

	adminsSnap.forEach((doc) => {
		const data = doc.data() as any;
		if (
			data?.enabled === true ||
			data?.granted === true ||
			data?.isPlatformAdmin === true
		) {
			const user = getOrCreateUser(doc.id);
			addRole(user, 'platform_admin');
		}
	});

	membershipsSnap.forEach((doc) => {
		const membership = doc.data() as ClinicMembershipDoc;
		const user = getOrCreateUser(membership.uid);
		addRole(user, membership.role as ClinicRole);
		user.clinics.push({
			clinicId: membership.clinicId,
			clinicName: clinicNames.get(membership.clinicId) ?? null,
			role: membership.role,
			isActive: membership.isActive !== false,
		});
	});

	patientsSnap.forEach((doc) => {
		const patient = doc.data() as PatientDoc;
		if (!patient.linkedUid) return;
		const user = getOrCreateUser(patient.linkedUid, {
			name: patient.name,
			email: patient.email,
		});
		addRole(user, 'patient');
		user.clinics.push({
			clinicId: patient.clinicId,
			clinicName: clinicNames.get(patient.clinicId) ?? null,
			role: 'patient',
			isActive: patient.status !== 'inactive',
		});
	});

	const allUsers = Array.from(users.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);

	return res.status(200).json({
		success: true,
		data: {
			roles: {
				platform_admin: allUsers.filter((user) =>
					user.roles.includes('platform_admin'),
				),
				clinic_admin: allUsers.filter((user) =>
					user.roles.includes('clinic_admin'),
				),
				staff: allUsers.filter((user) => user.roles.includes('staff')),
				professional: allUsers.filter((user) =>
					user.roles.includes('professional'),
				),
				patient: allUsers.filter((user) => user.roles.includes('patient')),
				unassigned: allUsers.filter((user) => user.roles.length === 0),
			},
			all: allUsers,
		},
	});
});

const setPlatformAdminSchema = z.object({
	uid: z.string().min(1),
	platformAdmin: z.boolean(),
});

router.post('/set-platform-admin', async (req: Request, res: Response) => {
	try {
		const parsed = setPlatformAdminSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const { auth } = getFirebaseAdmin();
		await auth.getUser(parsed.data.uid);
		await auth.setCustomUserClaims(parsed.data.uid, {
			platformAdmin: parsed.data.platformAdmin,
		});
		return res.status(200).json({
			success: true,
			message: 'Custom claims updated',
			data: { uid: parsed.data.uid, platformAdmin: parsed.data.platformAdmin },
		});
	} catch (err) {
		const msg =
			err instanceof Error ? err.message : 'Unknown error setting claims';
		return res.status(500).json({
			success: false,
			message: msg,
		});
	}
});

export const devRouter = router;
