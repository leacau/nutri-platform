import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getFirebaseAdmin } from '../firebase/admin.js';
import { denyAuthz } from '../security/authz.js';

const router = Router();

const bodySchema = z.object({
	uid: z.string().min(1),
	role: z.enum(['platform_admin', 'clinic_admin', 'nutri', 'staff', 'patient']),
	clinicId: z.string().min(1).optional(),
	secret: z.string().min(1),
});

router.post('/set-claims', async (req: Request, res: Response) => {
	// DEV-only: en producción no existe. No filtramos info.
	if (process.env.NODE_ENV === 'production') {
		return res.status(404).json({ success: false, message: 'Not found' });
	}

	const parsed = bodySchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({
			success: false,
			message: 'Invalid body',
			errors: parsed.error.flatten(),
		});
	}

	const { uid, role, clinicId, secret } = parsed.data;

	if (secret !== process.env.DEV_ADMIN_SECRET) {
		return denyAuthz(req, res, 'Invalid dev secret');
	}

	// Reglas duras de claims
	if (
		(role === 'clinic_admin' || role === 'nutri' || role === 'staff') &&
		!clinicId
	) {
		return res.status(400).json({
			success: false,
			message: 'clinicId is required for this role',
		});
	}

	try {
		const { auth } = getFirebaseAdmin();

		// Validación explícita: si el usuario no existe devolvemos 404 y NO crasheamos.
		await auth.getUser(uid);

		await auth.setCustomUserClaims(uid, {
			role,
			clinicId: clinicId ?? null,
		});

		return res.status(200).json({
			success: true,
			message: 'Claims updated',
			data: { uid, role, clinicId: clinicId ?? null },
		});
	} catch (err) {
		// Nunca dejamos que un async error mate el proceso.
		// Respondemos con códigos coherentes y formato estándar.
		const msg =
			err instanceof Error ? err.message : 'Unknown error while setting claims';

		// Detección del caso típico auth/user-not-found (admin SDK)
		if (msg.toLowerCase().includes('no user record')) {
			return res.status(404).json({
				success: false,
				message: 'User not found in Auth (emulator)',
			});
		}

		return res.status(500).json({
			success: false,
			message: 'Failed to set claims',
			errors: { detail: msg },
		});
	}
});

export const devRouter = router;
