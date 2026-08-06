import type { NextFunction, Request, Response } from 'express';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
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

const HEADER = 'x-clinic-id';

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

async function resolvePatientDocumentForClinic(uid: string, clinicId: string) {
	const db = getFirestoreDb();
	const patientSnap = await db
		.collection('patients')
		.where('clinicId', '==', clinicId)
		.where('linkedUid', '==', uid)
		.limit(1)
		.get();

	let patientDoc: DocumentSnapshot | undefined = patientSnap.docs[0];
	if (patientDoc) return patientDoc;

	const appointmentSnap = await db
		.collection('appointments')
		.where('clinicId', '==', clinicId)
		.where('patientUid', '==', uid)
		.limit(1)
		.get();
	const patientId = appointmentSnap.docs[0]?.data()?.patientId;
	if (!patientId) return undefined;

	const appointmentPatientDoc = await db.collection('patients').doc(patientId).get();
	if (
		appointmentPatientDoc.exists &&
		appointmentPatientDoc.data()?.clinicId === clinicId
	) {
		patientDoc = appointmentPatientDoc;
	}

	return patientDoc;
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
		req.auth = {
			...req.auth,
			clinicId: headerClinicId,
			role: 'platform_admin',
			clinicCapabilities: defaultCapabilitiesForRole('clinic_admin'),
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
		const patientDoc =
			req.patientContext?.patientId
				? await getFirestoreDb()
						.collection('patients')
						.doc(req.patientContext.patientId)
						.get()
				: await resolvePatientDocumentForClinic(req.auth.uid, resolvedClinicId);
		const patient = patientDoc?.data() as PatientDoc | undefined;
		if (!patientDoc || !patientDoc.exists || !patient) {
			return denyAuthz(req, res, 'Failed to resolve patient context', 403);
		}
		if (patient.status !== 'active' || patient.portalAccessEnabled === false) {
			return denyAuthz(req, res, 'Patient portal access is disabled', 403);
		}

		req.patientContext = {
			patientId: patientDoc.id,
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
		const patientDoc = await resolvePatientDocumentForClinic(
			req.auth.uid,
			headerClinicId,
		);

		if (patientDoc) {
			const patient = patientDoc?.data() as PatientDoc | undefined;
			if (!patientDoc || !patient) {
				return denyAuthz(req, res, 'Failed to resolve patient context', 403);
			}
			if (!(await isPatientPortalModuleEnabled(headerClinicId))) {
				return denyAuthz(req, res, 'Patient portal module is not enabled', 403);
			}
			if (patient.status !== 'active' || patient.portalAccessEnabled === false) {
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
