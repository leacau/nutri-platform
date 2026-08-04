import type { NextFunction, Request, Response } from 'express';
import { getFirestoreDb } from '../firebase/firestore.js';
import { denyAuthz } from '../security/authz.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';
import type { ClinicRole } from '../types/auth.js';

const HEADER = 'x-clinic-id';

async function assertClinicIsActive(clinicId: string, res: Response) {
	const db = getFirestoreDb();
	const clinicSnap = await db.collection('clinics').doc(clinicId).get();
	if (!clinicSnap.exists) {
		res.status(404).json({ success: false, message: 'Clinic not found' });
		return false;
	}
	const data = clinicSnap.data() as { isActive?: boolean } | undefined;
	if (data?.isActive === false) {
		res.status(403).json({ success: false, message: 'Clinic inactive' });
		return false;
	}
	return true;
}

export async function requireClinicContext(
	req: Request,
	res: Response,
	next: NextFunction
) {
	if (!req.auth) {
		return denyAuthz(req, res, 'Unauthenticated access to clinic scoped route', 401);
	}

	const headerClinicId = req.header(HEADER) ?? null;

	// Platform admin: confía en el header (auditaría en prod)
	if (req.auth.isPlatformAdmin) {
		if (!headerClinicId) {
			return res.status(400).json({
				success: false,
				message: 'Missing X-Clinic-Id header',
			});
		}
		if (!(await assertClinicIsActive(headerClinicId, res))) return;
		req.auth = { ...req.auth, clinicId: headerClinicId, role: 'platform_admin' };
		return next();
	}

	/**
	 * Patient Portal:
	 * - No tiene memberships.
	 * - El clinicId debe venir resuelto por resolveSessionContext (req.patientContext/req.auth.clinicId).
	 * - Si viene header, debe coincidir (defensa).
	 */
	if (req.auth.role === 'patient') {
		const resolvedClinicId =
			req.patientContext?.clinicId ?? req.auth.clinicId ?? null;

		if (!resolvedClinicId) {
			return res.status(400).json({
				success: false,
				message: 'Missing clinic context for patient',
			});
		}

		if (headerClinicId && headerClinicId !== resolvedClinicId) {
			return denyAuthz(
				req,
				res,
				`Invalid clinic selection for patient. Provided=${headerClinicId} Resolved=${resolvedClinicId}`,
				403
			);
		}

		if (!(await assertClinicIsActive(resolvedClinicId, res))) return;
		req.auth = { ...req.auth, clinicId: resolvedClinicId, role: 'patient' };
		return next();
	}

	// Staff/Nutri/Admin: requiere header + membership
	if (!headerClinicId) {
		return res.status(400).json({
			success: false,
			message: 'Missing X-Clinic-Id header',
		});
	}

	if (!(await assertClinicIsActive(headerClinicId, res))) return;

	const db = getFirestoreDb();
	const snap = await db
		.collection('clinic_memberships')
		.where('clinicId', '==', headerClinicId)
		.where('uid', '==', req.auth.uid)
		.where('isActive', '==', true)
		.limit(1)
		.get();

	if (snap.empty) {
		return denyAuthz(
			req,
			res,
			`User ${req.auth.uid} has no active membership in clinic ${headerClinicId}`,
			403
		);
	}

	const membershipDoc = snap.docs[0];
	if (!membershipDoc) {
		return denyAuthz(req, res, 'Failed to resolve clinic membership', 403);
	}

	const membership = membershipDoc.data() as ClinicMembershipDoc;
	const role = membership.role as ClinicRole;

	req.auth = {
		...req.auth,
		clinicId: headerClinicId,
		role,
	};

	return next();
}
