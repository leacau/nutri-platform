import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/requireRole.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import {
	createClinicSchema,
	createClinicWithAdmin,
	mapClinicSummary,
} from './clinicAdminUtils.js';
import type { ClinicDoc } from '../types/clinics.js';

const router = Router();

router.get(
	'/',
	authMiddleware,
	requireRole('platform_admin'),
	async (_req: Request, res: Response) => {
		const db = getFirestoreDb();
		const snap = await db
			.collection('clinics')
			.orderBy('createdAt', 'desc')
			.get();

		const clinics = snap.docs.map((doc) =>
			mapClinicSummary(doc.id, doc.data() as ClinicDoc)
		);

		return res.status(200).json({ success: true, data: clinics });
	}
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

		const dniInt = parseInt(parsed.data.admin.dni, 10);
		if (dniInt < 1000000 || dniInt > 99999999) {
			return res.status(400).json({
				success: false,
				message: 'DNI must be between 1000000 and 99999999',
			});
		}

		const db = getFirestoreDb();
		const { clinic } = await createClinicWithAdmin({
			db,
			data: parsed.data,
			createdByUid: req.auth?.uid ?? null,
		});

		return res.status(201).json({
			success: true,
			data: clinic,
		});
	}
);

export const adminClinicsRouter = router;
