import type { AuthContext, AuthenticatedUser } from '../types/auth.js';
import type { NextFunction, Request, Response } from 'express';

import { getFirebaseAdmin } from '../firebase/admin.js';
import { getFirestoreDb } from '../firebase/firestore.js';

// 👇 Ajustá este import si tu archivo exporta con otro nombre.
// Lo común en tu repo (por el comentario) es getFirestoreDb().

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

async function isPlatformAdminFromFirestore(uid: string): Promise<boolean> {
	// ✅ Multi-database friendly: usamos el helper del proyecto, NO admin.firestore()
	const db = getFirestoreDb();

	// Fuente de verdad principal: platformAdmins/{uid}
	const adminDoc = await db.collection('platformAdmins').doc(uid).get();
	if (adminDoc.exists) {
		const data = adminDoc.data() as any;
		// Si tu script guarda "enabled: true", esto lo toma.
		// Si guarda otra cosa (ej "granted: true"), también lo cubrimos.
		if (
			data?.enabled === true ||
			data?.granted === true ||
			data?.isPlatformAdmin === true
		) {
			return true;
		}
	}

	// Fallback opcional: users/{uid}.isPlatformAdmin
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
	// ✅ Preflight: no autenticamos OPTIONS (CORS)
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

		// Fast-path por claims (si vuelven a funcionar)
		const isPlatformAdminFromClaims =
			decoded.platformAdmin === true ||
			decoded.platform_admin === true ||
			decoded.platform_admin === 'true';

		// Source of truth: Firestore
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
	} catch (err) {
		return res.status(401).json({
			success: false,
			message: 'Invalid or expired token',
		});
	}
}
