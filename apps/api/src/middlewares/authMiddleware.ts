import type { AuthContext, Role } from '../types/auth.js';
import type { NextFunction, Request, Response } from 'express';

import { getFirebaseAdmin } from '../firebase/admin.js';

function parseBearer(headerValue: string | undefined): string | null {
	if (!headerValue) return null;
	const parts = headerValue.split(' ');
	if (parts.length !== 2) return null;
	const [scheme, token] = parts;
	if (scheme !== 'Bearer') return null;
	if (!token) return null;
	return token;
}

export async function authMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
) {
	try {
		const token = parseBearer(req.header('Authorization'));
		if (!token) {
			return res.status(401).json({
				success: false,
				message: 'Missing Authorization Bearer token',
			});
		}

		const { auth } = getFirebaseAdmin();

		// NO confiamos en nada del front. Verify real.
		const decoded = await auth.verifyIdToken(token);

		const role = decoded.role as Role | undefined;
		const clinicId = decoded.clinicId as string | undefined;

		const ctx: AuthContext = {
			uid: decoded.uid,
			email: decoded.email ?? null,
			...(role ? { role } : {}),
			...(clinicId ? { clinicId } : {}),
		};

		req.auth = ctx;
		next();
	} catch (err) {
		// Fail closed
		return res.status(401).json({
			success: false,
			message: 'Invalid or expired token',
		});
	}
}
