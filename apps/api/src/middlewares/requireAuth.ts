import type { AuthContext, AuthenticatedUser } from '../types/auth.js';
import type { NextFunction, Request, Response } from 'express';

import { getFirebaseAdmin } from '../firebase/admin.js';

function parseBearer(headerValue: string | undefined): string | null {
	if (!headerValue) return null;

	// Soporta múltiples espacios: "Bearer   token"
	const parts = headerValue.trim().split(/\s+/);
	if (parts.length !== 2) return null;

	const [scheme, token] = parts;
	if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
	if (!token) return null;

	return token;
}

export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction
) {
	// ✅ Preflight: no autenticamos OPTIONS.
	// Esto evita "CORS Missing Allow Origin" cuando el browser valida Authorization.
	if (req.method === 'OPTIONS') {
		return res.status(204).send();
	}

	// Si ya fue autenticado por un middleware previo
	if ((req as any).auth && (req as any).user) return next();

	try {
		const token = parseBearer(req.header('Authorization'));
		if (!token) {
			return res.status(401).json({
				success: false,
				message: 'Missing Authorization Bearer token',
			});
		}

		const { auth } = getFirebaseAdmin();
		const decoded = await auth.verifyIdToken(token);

		const { uid, email, ...claims } = decoded as any;

		const user: AuthenticatedUser = {
			uid,
			email: email ?? null,
			claims,
		};

		const isPlatformAdmin =
			decoded.platformAdmin === true || decoded.platform_admin === true;

		const authContext: AuthContext = {
			uid,
			email: email ?? null,
			isPlatformAdmin,
			role: null,
			clinicId: null,
		};

		(req as any).user = user;
		(req as any).auth = authContext;

		return next();
	} catch (err) {
		return res.status(401).json({
			success: false,
			message: 'Invalid or expired token',
		});
	}
}
