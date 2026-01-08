import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicMembershipDoc, ClinicDoc } from '../types/clinics.js';
import type { PatientDoc } from '../types/patients.js';
import { getFirebaseAdmin } from '../firebase/admin.js';

const router = Router();

// Schema sin 'secret'
const seedSchema = z.object({
	// secret: z.string().min(1), <--- Eliminado
	clinic: z.object({
		clinicId: z.string().optional(),
		name: z.string().min(1),
	}),
	users: z.array(
		z.object({
			uid: z.string().min(1),
			email: z.string().optional().nullable(),
			roleInClinic: z.enum(['clinic_admin', 'nutri', 'staff']),
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
				assignedNutriUid: z.string().optional().nullable(),
			})
		)
		.optional(),
});

router.post('/seed', async (req: Request, res: Response) => {
	// Nota: La validación de NODE_ENV y x-dev-secret ya se hizo en app.ts

	const parsed = seedSchema.safeParse(req.body ?? {});
	if (!parsed.success) {
		return res.status(400).json({
			success: false,
			message: 'Invalid body',
			errors: parsed.error.flatten(),
		});
	}

	const db = getFirestoreDb();
	const now = Timestamp.now();
	const clinicId =
		parsed.data.clinic.clinicId ?? db.collection('clinics').doc().id;

	const clinicDoc: ClinicDoc = {
		name: parsed.data.clinic.name,
		createdAt: now,
		updatedAt: now,
	};
	await db.collection('clinics').doc(clinicId).set(clinicDoc, { merge: true });

	const membershipIds: string[] = [];

	for (const u of parsed.data.users) {
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
			const patient: PatientDoc = {
				clinicId,
				name: p.name,
				email: p.email ?? null,
				phone: p.phone ?? null,
				linkedUid: p.linkedUid ?? null,
				assignedNutriUid: p.assignedNutriUid ?? null,
				status: 'active',
				createdAt: now,
				updatedAt: now,
			};
			const ref = db.collection('patients').doc();
			await ref.set(patient);
			patientIds.push(ref.id);
		}
	}

	return res.status(200).json({
		success: true,
		message: 'Seeded',
		data: { clinicId, memberships: membershipIds, patients: patientIds },
	});
});

// Schema sin 'secret'
const setPlatformAdminSchema = z.object({
	// secret: z.string().min(1), <--- Eliminado
	uid: z.string().min(1),
	platformAdmin: z.boolean(),
});

router.post('/set-platform-admin', async (req: Request, res: Response) => {
	const parsed = setPlatformAdminSchema.safeParse(req.body ?? {});
	if (!parsed.success) {
		return res.status(400).json({
			success: false,
			message: 'Invalid body',
			errors: parsed.error.flatten(),
		});
	}

	const { auth } = getFirebaseAdmin();
	try {
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
