import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { getFirestoreDb } from '../firebase/firestore.js';

const router = Router();

const upsertUserSchema = z.object({
	name: z.string().min(2),
	email: z.string().email().optional(),
	dni: z.string().min(7).max(8).regex(/^\d+$/).optional(),
});

router.post('/self', authMiddleware, async (req: Request, res: Response) => {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	const parsed = upsertUserSchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({
			success: false,
			message: 'Invalid body',
			errors: parsed.error.flatten(),
		});
	}

	const db = getFirestoreDb();
	const now = Timestamp.now();
	const userRef = db.collection('users').doc(req.auth.uid);
	const existing = await userRef.get();

	const dniInt =
		parsed.data.dni !== undefined ? parseInt(parsed.data.dni, 10) : null;

	if (dniInt !== null && (dniInt < 1000000 || dniInt > 99999999)) {
		return res.status(400).json({
			success: false,
			message: 'DNI must be between 1000000 and 99999999',
		});
	}

	const payload = {
		name: parsed.data.name,
		email: parsed.data.email ?? req.auth.email ?? null,
		dni: dniInt ?? undefined,
		updatedAt: now,
		createdAt: existing.exists
			? (existing.data() as { createdAt?: Timestamp }).createdAt ?? now
			: now,
	};

	await userRef.set(payload, { merge: true });

	return res.status(200).json({
		success: true,
		message: 'User profile updated',
		data: { uid: req.auth.uid },
	});
});

export const usersRouter = router;
