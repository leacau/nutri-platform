import type { AuthContext, AuthenticatedUser } from '../types/auth.js';
import type { NextFunction, Request, Response } from 'express';

import { getFirebaseAdmin } from '../firebase/admin.js';
import { getFirestoreDb } from '../firebase/firestore.js';

function parseBearer(headerValue: string | undefined): string | null {
	if (!headerValue) return null;

	const parts = headerValue.trim().split(/\s+/);
	if (parts.length !== 2) return null;

	const [scheme, token] = parts;
	if (!scheme || scheme.toLowerCase() !== 'bearer') return null;
	if (!token) return null;

	return token;
}

async function isPlatformAdminFromFirestore(uid: string): Promise<boolean> {
	const db = getFirestoreDb();

	const adminDoc = await db.collection('platformAdmins').doc(uid).get();
	if (adminDoc.exists) {
		const data = adminDoc.data() as any;
		if (
			data?.enabled === true ||
			data?.granted === true ||
			data?.isPlatformAdmin === true
		) {
			return true;
		}
	}

	const userDoc = await db.collection('users').doc(uid).get();
	if (userDoc.exists) {
		const data = userDoc.data() as any;
		if (data?.isPlatformAdmin === true) return true;
	}

	return false;
}

export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	if (req.method === 'OPTIONS') {
		return res.status(204).send();
	}

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

		const isPlatformAdminFromClaims =
			decoded.platformAdmin === true ||
			decoded.platform_admin === true ||
			decoded.platform_admin === 'true';
		const isPlatformAdminFromDb = await isPlatformAdminFromFirestore(uid);
		const isPlatformAdmin = isPlatformAdminFromClaims || isPlatformAdminFromDb;

		const user: AuthenticatedUser = {
			uid,
			email: email ?? null,
			claims,
		};

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
	} catch {
		return res.status(401).json({
			success: false,
			message: 'Unauthorized',
		});
	}
}
