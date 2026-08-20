import type {
	DocumentSnapshot,
	Firestore,
	QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

import type { PatientDoc } from '../types/patients.js';

export type PatientPortalLink = { id: string } & PatientDoc;

function normalizeEmail(email: string | null | undefined) {
	const clean = email?.trim().toLowerCase();
	return clean || null;
}

function emailVariants(email: string | null | undefined) {
	const clean = email?.trim();
	const normalized = normalizeEmail(clean);
	if (!clean || !normalized) return [];
	return Array.from(new Set([clean, normalized]));
}

function addPatientLink(
	map: Map<string, PatientPortalLink>,
	doc: DocumentSnapshot | QueryDocumentSnapshot,
	clinicIdFilter?: string,
) {
	if (!doc.exists) return;
	const patient = doc.data() as PatientDoc | undefined;
	if (!patient?.clinicId || patient.status === 'inactive') return;
	if (clinicIdFilter && patient.clinicId !== clinicIdFilter) return;
	if (!map.has(patient.clinicId)) {
		map.set(patient.clinicId, { id: doc.id, ...patient });
	}
}

async function addPatientsByField(
	db: Firestore,
	map: Map<string, PatientPortalLink>,
	field: string,
	value: string,
	clinicIdFilter?: string,
) {
	let query = db.collection('patients').where(field, '==', value);
	if (clinicIdFilter) {
		query = query.where('clinicId', '==', clinicIdFilter);
	}
	const snap = await query.limit(25).get();
	snap.docs.forEach((doc) => addPatientLink(map, doc, clinicIdFilter));
}

async function addPatientsByAppointmentUid(
	db: Firestore,
	map: Map<string, PatientPortalLink>,
	uid: string,
	clinicIdFilter?: string,
) {
	let query = db.collection('appointments').where('patientUid', '==', uid);
	if (clinicIdFilter) {
		query = query.where('clinicId', '==', clinicIdFilter);
	}

	const appointmentsSnap = await query.limit(100).get();
	for (const appointmentDoc of appointmentsSnap.docs) {
		const appointment = appointmentDoc.data() as {
			clinicId?: string;
			patientId?: string;
		};
		if (!appointment.clinicId || !appointment.patientId) continue;
		if (clinicIdFilter && appointment.clinicId !== clinicIdFilter) continue;
		if (map.has(appointment.clinicId)) continue;

		const patientDoc = await db.collection('patients').doc(appointment.patientId).get();
		addPatientLink(map, patientDoc, clinicIdFilter);
	}
}

function patientMatchesAuth(
	patient: PatientDoc,
	input: { uid: string; email?: string | null | undefined },
) {
	if (patient.linkedUid === input.uid || patient.userId === input.uid) {
		return true;
	}
	const emails = emailVariants(input.email).map((email) => email.toLowerCase());
	const patientEmails = [patient.email, patient.emailLowercase]
		.filter(Boolean)
		.map((email) => String(email).trim().toLowerCase());
	return patientEmails.some((email) => emails.includes(email));
}

async function hasAppointmentLink(
	db: Firestore,
	input: { uid: string; clinicId: string; patientId: string },
) {
	const snap = await db
		.collection('appointments')
		.where('clinicId', '==', input.clinicId)
		.where('patientId', '==', input.patientId)
		.where('patientUid', '==', input.uid)
		.limit(1)
		.get();
	return !snap.empty;
}

export async function resolvePatientPortalClinics(
	db: Firestore,
	input: {
		uid: string;
		email?: string | null | undefined;
		clinicId?: string;
	},
): Promise<Map<string, PatientPortalLink>> {
	const map = new Map<string, PatientPortalLink>();
	const emails = emailVariants(input.email);

	await addPatientsByField(db, map, 'linkedUid', input.uid, input.clinicId);
	await addPatientsByAppointmentUid(db, map, input.uid, input.clinicId);

	for (const email of emails) {
		await addPatientsByField(db, map, 'email', email, input.clinicId);
		await addPatientsByField(db, map, 'emailLowercase', email, input.clinicId);
	}

	return map;
}

export async function resolvePatientPortalPatientForClinic(
	db: Firestore,
	input: {
		uid: string;
		email?: string | null | undefined;
		clinicId: string;
		patientId?: string | null | undefined;
	},
): Promise<PatientPortalLink | null> {
	if (input.patientId) {
		const doc = await db.collection('patients').doc(input.patientId).get();
		if (!doc.exists) return null;
		const patient = doc.data() as PatientDoc | undefined;
		if (!patient?.clinicId || patient.clinicId !== input.clinicId) return null;
		if (patient.status === 'inactive') return null;
		if (
			!patientMatchesAuth(patient, input) &&
			!(await hasAppointmentLink(db, {
				uid: input.uid,
				clinicId: input.clinicId,
				patientId: input.patientId,
			}))
		) {
			return null;
		}
		return { id: doc.id, ...patient };
	}

	const links = await resolvePatientPortalClinics(db, input);
	return links.get(input.clinicId) ?? null;
}
