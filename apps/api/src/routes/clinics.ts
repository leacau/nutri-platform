import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';
import type { ClinicRole } from '../types/auth.js';

const router = Router();

// Schema para Invitación/Creación por DNI
const inviteMemberSchema = z.object({
	name: z.string().min(2),
	email: z.string().email(),
	dni: z.string().min(6).max(8),
	role: z.enum(['clinic_admin', 'nutri', 'staff']),
});

// Endpoint de Búsqueda de Usuario Global (para validar antes de invitar)
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

		// CORRECCIÓN TS18048: Verificar explícitamente que 'd' existe
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
	}
);

router.get('/mine', authMiddleware, async (req: Request, res: Response) => {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	const db = getFirestoreDb();
	const membershipsSnap = await db
		.collection('clinic_memberships')
		.where('uid', '==', req.auth.uid)
		.where('isActive', '==', true)
		.get();

	const clinics: Array<{
		clinicId: string;
		role: ClinicRole;
		clinicName: string | null;
	}> = [];

	for (const doc of membershipsSnap.docs) {
		const data = doc.data() as ClinicMembershipDoc;
		const clinicSnap = await db.collection('clinics').doc(data.clinicId).get();
		const clinicName = clinicSnap.exists
			? (clinicSnap.data() as { name?: string })?.name ?? null
			: null;
		clinics.push({
			clinicId: data.clinicId,
			role: data.role,
			clinicName,
		});
	}

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

const upsertMemberBody = z.object({
	uid: z.string().min(1),
	role: z.enum(['clinic_admin', 'nutri', 'staff']),
	isActive: z.boolean().optional(),
});

// Endpoint existente para actualizar miembros por UID
router.post(
	'/:clinicId/members',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
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
	}
);

// NUEVO: Invitar/Crear Miembro por DNI
router.post(
	'/:clinicId/invite',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
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

		const db = getFirestoreDb();
		const dniInt = parseInt(parsed.data.dni, 10);

		// 1. Verificar si existe en 'users' globalmente por DNI
		const userSnap = await db
			.collection('users')
			.where('dni', '==', dniInt)
			.limit(1)
			.get();

		let uid: string;
		const now = Timestamp.now();

		if (!userSnap.empty) {
			// Usuario existe: Usamos su UID
			const userDoc = userSnap.docs[0];
			if (!userDoc) throw new Error('Unexpected null doc');
			uid = userDoc.id;
		} else {
			// Usuario NO existe: Creamos el User Doc
			const newUserRef = db.collection('users').doc();
			uid = newUserRef.id;

			await newUserRef.set({
				email: parsed.data.email,
				dni: dniInt,
				name: parsed.data.name,
				createdAt: now,
				updatedAt: now,
			});
		}

		// 2. Verificar/Crear Membresía en la Clínica
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
	}
);

router.get(
	'/:clinicId/members',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
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
			})
		);

		return res.status(200).json({ success: true, data: members });
	}
);

export const clinicsRouter = router;
