import type { NextFunction, Request, Response } from 'express';
import { getFirestoreDb } from '../firebase/firestore.js';
import { denyAuthz } from '../security/authz.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';
import type { ClinicRole } from '../types/auth.js';

const HEADER = 'x-clinic-id';

export async function requireClinicContext(
	req: Request,
	res: Response,
	next: NextFunction
) {
	if (!req.auth) {
		return denyAuthz(req, res, 'Unauthenticated access to clinic scoped route', 401);
	}

	const clinicId = req.header(HEADER);
	if (!clinicId) {
		return res.status(400).json({
			success: false,
			message: 'Missing X-Clinic-Id header',
		});
	}

	// Platform admin: confía en el header (auditaría en prod)
	if (req.auth.isPlatformAdmin) {
		req.auth = { ...req.auth, clinicId, role: 'platform_admin' };
		return next();
	}

	const db = getFirestoreDb();
	const snap = await db
		.collection('clinic_memberships')
		.where('clinicId', '==', clinicId)
		.where('uid', '==', req.auth.uid)
		.where('isActive', '==', true)
		.limit(1)
		.get();

	if (snap.empty) {
		return denyAuthz(
			req,
			res,
			`User ${req.auth.uid} has no active membership in clinic ${clinicId}`
		);
	}

	const membershipDoc = snap.docs[0];
	if (!membershipDoc) {
		return denyAuthz(req, res, 'Failed to resolve clinic membership');
	}
	const membership = membershipDoc.data() as ClinicMembershipDoc;
	const role = membership.role as ClinicRole;

	req.auth = {
		...req.auth,
		clinicId,
		role,
	};

	return next();
}
