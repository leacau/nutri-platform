import type { NextFunction, Request, Response } from 'express';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { PatientDoc } from '../types/patients.js';

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

	let doc: DocumentSnapshot | undefined = snap.docs[0];

	if (snap.empty) {
		const appointmentSnap = await db
			.collection('appointments')
			.where('clinicId', '==', clinicId)
			.where('patientUid', '==', req.auth.uid)
			.limit(1)
			.get();

		const patientId = appointmentSnap.docs[0]?.data()?.patientId;
		if (patientId) {
			const patientDoc = await db.collection('patients').doc(patientId).get();
			if (patientDoc.exists && patientDoc.data()?.clinicId === clinicId) {
				doc = patientDoc;
			}
		}
	}

	if (!doc) {
		return denyAuthz(
			req,
			res,
			`User ${req.auth.uid} is not linked as patient in clinic ${clinicId}`
		);
	}

	const patient = doc.data() as PatientDoc;
	if (patient.portalAccessEnabled === false || patient.status !== 'active') {
		return denyAuthz(req, res, 'Patient portal access is disabled');
	}

	req.patientContext = { patientId: doc.id, clinicId };
	return next();
}
