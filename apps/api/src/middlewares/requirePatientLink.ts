import type { NextFunction, Request, Response } from 'express';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';

const HEADER = 'x-clinic-id';

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
	const snap = await db
		.collection('patients')
		.where('clinicId', '==', clinicId)
		.where('linkedUid', '==', req.auth.uid)
		.limit(1)
		.get();

	if (snap.empty) {
		return denyAuthz(
			req,
			res,
			`User ${req.auth.uid} is not linked as patient in clinic ${clinicId}`
		);
	}

	const doc = snap.docs[0];
	if (!doc) {
		return denyAuthz(req, res, 'Failed to resolve patient link for user');
	}
	req.patientContext = { patientId: doc.id, clinicId };
	return next();
}
