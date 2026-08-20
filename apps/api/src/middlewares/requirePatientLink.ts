import type { NextFunction, Request, Response } from 'express';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicDoc } from '../types/clinics.js';
import { normalizeBilling } from '../billing/plans.js';
import { resolvePatientPortalPatientForClinic } from '../security/patientPortalLink.js';

const HEADER = 'x-clinic-id';

async function isPatientPortalModuleEnabled(clinicId: string) {
	const clinicSnap = await getFirestoreDb().collection('clinics').doc(clinicId).get();
	if (!clinicSnap.exists) return false;
	const clinic = clinicSnap.data() as ClinicDoc | undefined;
	const billing = normalizeBilling(
		clinic?.billing,
		clinic?.tenantType === 'individual_practice' ? 'individual' : 'starter_1_5',
	);
	return billing.enabledModules.patientPortal === true;
}

export async function requirePatientLink(req: Request, res: Response, next: NextFunction) {
	if (!req.auth) {
		return denyAuthz(req, res, 'Unauthenticated access to patient-scoped route', 401);
	}

	const clinicId = req.header(HEADER);
	if (!clinicId) {
		return res.status(400).json({
			success: false,
			message: 'Missing X-Clinic-Id header',
		});
	}

	const db = getFirestoreDb();
	if (!(await isPatientPortalModuleEnabled(clinicId))) {
		return denyAuthz(req, res, 'Patient portal module is not enabled', 403);
	}

	const patient = await resolvePatientPortalPatientForClinic(db, {
		uid: req.auth.uid,
		email: req.auth.email,
		clinicId,
	});

	if (!patient) {
		return denyAuthz(
			req,
			res,
			`User ${req.auth.uid} is not linked as patient in clinic ${clinicId}`
		);
	}

	if (patient.portalAccessEnabled === false || patient.status === 'inactive') {
		return denyAuthz(req, res, 'Patient portal access is disabled');
	}

	req.patientContext = { patientId: patient.id, clinicId };
	return next();
}
