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

	const clinics: Array<{ clinicId: string; role: ClinicRole; clinicName: string | null }> = [];

	for (const doc of membershipsSnap.docs) {
		const data = doc.data() as ClinicMembershipDoc;
		const clinicSnap = await db.collection('clinics').doc(data.clinicId).get();
		const clinicName = clinicSnap.exists
			? ((clinicSnap.data() as { name?: string })?.name ?? null)
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

router.post(
	'/:clinicId/members',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId) {
			return res.status(400).json({ success: false, message: 'Missing clinicId param' });
		}

		if (req.auth && !req.auth.isPlatformAdmin && req.auth.clinicId !== clinicId) {
			return res.status(400).json({
				success: false,
				message: 'X-Clinic-Id must match clinicId param',
			});
		}

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
			return res.status(201).json({ success: true, message: 'Member added', data: { id: ref.id, ...doc } });
		}

		const doc = existing.docs[0];
		if (!doc) {
			return res.status(500).json({ success: false, message: 'Failed to resolve existing membership' });
		}
		await db.collection('clinic_memberships').doc(doc.id).update({
			role: parsed.data.role,
			isActive: parsed.data.isActive ?? true,
			updatedAt: now,
		});

		return res.status(200).json({
			success: true,
			message: 'Member updated',
			data: { id: doc.id, ...(doc.data() as ClinicMembershipDoc), ...parsed.data, updatedAt: now },
		});
	}
);

router.get(
	'/:clinicId/members',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId) {
			return res.status(400).json({ success: false, message: 'Missing clinicId param' });
		}

		if (req.auth && !req.auth.isPlatformAdmin && req.auth.clinicId !== clinicId) {
			return res.status(400).json({
				success: false,
				message: 'X-Clinic-Id must match clinicId param',
			});
		}

		const db = getFirestoreDb();
		const snap = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.where('isActive', '==', true)
			.get();

		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ClinicMembershipDoc) }));
		return res.status(200).json({ success: true, data: items });
	}
);

export const clinicsRouter = router;
