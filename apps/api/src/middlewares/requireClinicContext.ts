import type { NextFunction, Request, Response } from 'express';
import { getFirestoreDb } from '../firebase/firestore.js';
import { denyAuthz } from '../security/authz.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';
import type { PatientDoc } from '../types/patients.js';
import { pickHighestClinicRole } from '../security/clinicRolePriority.js';
import {
	defaultCapabilitiesForRole,
	mergeMembershipCapabilities,
} from '../security/clinicCapabilities.js';
import { normalizeBilling } from '../billing/plans.js';
import { resolvePatientPortalPatientForClinic } from '../security/patientPortalLink.js';

const HEADER = 'x-clinic-id';

function requestedPatientId(req: Request) {
	const paramsPatientId =
		typeof req.params?.patientId === 'string' ? req.params.patientId : null;
	const bodyPatientId =
		typeof req.body?.patientId === 'string' ? req.body.patientId : null;
	const queryPatientId =
		typeof req.query?.patientId === 'string' ? req.query.patientId : null;
	return paramsPatientId ?? bodyPatientId ?? queryPatientId ?? null;
}

async function isPatientPortalModuleEnabled(clinicId: string) {
	const db = getFirestoreDb();
	const clinicSnap = await db.collection('clinics').doc(clinicId).get();
	if (!clinicSnap.exists) return false;
	const data = clinicSnap.data() as any;
	const billing = normalizeBilling(
		data?.billing,
		data?.tenantType === 'individual_practice' ? 'individual' : 'starter_1_5',
	);
	return billing.enabledModules.patientPortal === true;
}

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
	const portalMode = req.header('x-portal-mode') === 'patient';

	// Platform admin: confía en el header (auditaría en prod)
	if (req.auth.isPlatformAdmin) {
		if (!headerClinicId) {
			return res.status(400).json({
				success: false,
				message: 'Missing X-Clinic-Id header',
			});
		}
		if (!(await assertClinicIsActive(headerClinicId, res))) return;
		req.auth = {
			...req.auth,
			clinicId: headerClinicId,
			role: 'platform_admin',
			clinicCapabilities: defaultCapabilitiesForRole('clinic_admin'),
		};
		return next();
	}

	if (portalMode) {
		if (!headerClinicId) {
			return res.status(400).json({
				success: false,
				message: 'Missing X-Clinic-Id header',
			});
		}

		if (!(await assertClinicIsActive(headerClinicId, res))) return;
		if (!(await isPatientPortalModuleEnabled(headerClinicId))) {
			return denyAuthz(req, res, 'Patient portal module is not enabled', 403);
		}

		const patientDoc = await resolvePatientPortalPatientForClinic(
			getFirestoreDb(),
			{
				uid: req.auth.uid,
				email: req.auth.email,
				clinicId: headerClinicId,
				patientId: requestedPatientId(req),
			},
		);

		if (!patientDoc) {
			return denyAuthz(
				req,
				res,
				`User ${req.auth.uid} is not linked as patient in clinic ${headerClinicId}`,
				403,
			);
		}

		if (
			patientDoc.status === 'inactive' ||
			patientDoc.portalAccessEnabled === false
		) {
			return denyAuthz(req, res, 'Patient portal access is disabled', 403);
		}

		req.patientContext = {
			patientId: patientDoc.id,
			clinicId: headerClinicId,
		};
		req.auth = {
			...req.auth,
			clinicId: headerClinicId,
			role: 'patient',
			clinicCapabilities: [],
		};
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
		if (!(await isPatientPortalModuleEnabled(resolvedClinicId))) {
			return denyAuthz(req, res, 'Patient portal module is not enabled', 403);
		}
		const patientLink =
			req.patientContext?.patientId
				? await getFirestoreDb()
						.collection('patients')
						.doc(req.patientContext.patientId)
						.get()
						.then((doc) => {
							const patient = doc.data() as PatientDoc | undefined;
							return doc.exists && patient?.clinicId === resolvedClinicId
								? { id: doc.id, ...patient }
								: null;
						})
				: await resolvePatientPortalPatientForClinic(getFirestoreDb(), {
						uid: req.auth.uid,
						email: req.auth.email,
						clinicId: resolvedClinicId,
						patientId: requestedPatientId(req),
					});
		if (!patientLink) {
			return denyAuthz(req, res, 'Failed to resolve patient context', 403);
		}
		if (
			patientLink.status === 'inactive' ||
			patientLink.portalAccessEnabled === false
		) {
			return denyAuthz(req, res, 'Patient portal access is disabled', 403);
		}

		req.patientContext = {
			patientId: patientLink.id,
			clinicId: resolvedClinicId,
		};
		req.auth = {
			...req.auth,
			clinicId: resolvedClinicId,
			role: 'patient',
			clinicCapabilities: [],
		};
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
		.get();

	if (snap.empty) {
		const patientDoc = await resolvePatientPortalPatientForClinic(db, {
			uid: req.auth.uid,
			email: req.auth.email,
			clinicId: headerClinicId,
			patientId: requestedPatientId(req),
		});

		if (patientDoc) {
			if (!(await isPatientPortalModuleEnabled(headerClinicId))) {
				return denyAuthz(req, res, 'Patient portal module is not enabled', 403);
			}
			if (
				patientDoc.status === 'inactive' ||
				patientDoc.portalAccessEnabled === false
			) {
				return denyAuthz(req, res, 'Patient portal access is disabled', 403);
			}

			req.patientContext = {
				patientId: patientDoc.id,
				clinicId: headerClinicId,
			};
			req.auth = {
				...req.auth,
				clinicId: headerClinicId,
				role: 'patient',
				clinicCapabilities: [],
			};
			return next();
		}

		return denyAuthz(
			req,
			res,
			`User ${req.auth.uid} has no active membership in clinic ${headerClinicId}`,
			403
		);
	}

	const memberships = snap.docs.map((doc) => doc.data() as ClinicMembershipDoc);
	const role = pickHighestClinicRole(
		memberships.map((membership) => membership.role),
	);

	if (!role) {
		return denyAuthz(req, res, 'Failed to resolve clinic membership', 403);
	}

	req.auth = {
		...req.auth,
		clinicId: headerClinicId,
		role,
		clinicCapabilities: mergeMembershipCapabilities(memberships),
	};

	return next();
}
