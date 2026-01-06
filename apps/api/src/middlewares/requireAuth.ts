import type { NextFunction, Request, Response } from 'express';

import { getFirebaseAdmin } from '../firebase/admin.js';
import type { AuthenticatedUser, AuthContext } from '../types/auth.js';

function parseBearer(headerValue: string | undefined): string | null {
	if (!headerValue) return null;
	const parts = headerValue.split(' ');
	if (parts.length !== 2) return null;
	const [scheme, token] = parts;
	if (scheme !== 'Bearer') return null;
	if (!token) return null;
	return token;
}

export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction
) {
	if (req.auth && req.user) return next();

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
		const { uid, email, ...claims } = decoded;

		const user: AuthenticatedUser = {
			uid,
			email: email ?? null,
			claims,
		};

		const authContext: AuthContext = {
			uid,
			email: email ?? null,
			isPlatformAdmin: decoded.platformAdmin === true,
			role: null,
			clinicId: null,
		};

		req.user = user;
		req.auth = authContext;
		return next();
	} catch (err) {
		return res.status(401).json({
			success: false,
			message: 'Invalid or expired token',
		});
	}
}
