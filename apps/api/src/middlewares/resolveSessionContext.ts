import type {
	DocumentSnapshot,
	Firestore,
	QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import type { NextFunction, Request, Response } from 'express';

import type { ClinicMembershipDoc } from '../types/clinics.js';
import type { PatientDoc } from '../types/patients.js';
import type { Role } from '../types/auth.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import {
	compareClinicRoles,
	isClinicRole,
} from '../security/clinicRolePriority.js';

export interface SessionAnalysisResult {
	staffClinics: Array<{
		clinicId: string;
		role: Role;
		clinicName: string | null;
	}>;
	patientClinics: Array<{
		clinicId: string;
		clinicName: string | null;
		patientId: string;
	}>;
	resolved: {
		role: Role | null;
		clinicId: string | null;
		patientId: string | null;
	};
}

export async function analyzeUserSession(
	uid: string,
	xClinicIdHeader: string | undefined,
	isPlatformAdmin: boolean = false,
): Promise<SessionAnalysisResult> {
	const db = getFirestoreDb();

	const result: SessionAnalysisResult = {
		staffClinics: [],
		patientClinics: [],
		resolved: { role: null, clinicId: null, patientId: null },
	};

	if (isPlatformAdmin) {
		if (xClinicIdHeader) {
			const clinicDoc = await db
				.collection('clinics')
				.doc(xClinicIdHeader)
				.get();
			if (clinicDoc.exists) {
				result.resolved.role = 'clinic_admin';
				result.resolved.clinicId = xClinicIdHeader;
				result.staffClinics.push({
					clinicId: xClinicIdHeader,
					role: 'clinic_admin',
					clinicName: (clinicDoc.data() as any)?.name ?? 'Sin nombre',
				});
			}
			return result;
		}

		const snap = await db
			.collection('clinics')
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();
		snap.forEach((doc) => {
			result.staffClinics.push({
				clinicId: doc.id,
				role: 'clinic_admin',
				clinicName: (doc.data() as any)?.name ?? 'Sin nombre',
			});
		});
	}

	const membershipsSnap = await db
		.collection('clinic_memberships')
		.where('uid', '==', uid)
		.where('isActive', '==', true)
		.get();

	if (!membershipsSnap.empty) {
		const clinicIdsToFetch = new Set<string>();
		const staffClinicsById = new Map<string, Role>();

		membershipsSnap.forEach((doc: QueryDocumentSnapshot) => {
			const data = doc.data() as ClinicMembershipDoc;
			if (!isClinicRole(data.role)) return;

			clinicIdsToFetch.add(data.clinicId);

			const current = staffClinicsById.get(data.clinicId);
			if (
				!current ||
				(isClinicRole(current) && compareClinicRoles(data.role, current) > 0)
			) {
				staffClinicsById.set(data.clinicId, data.role);
			}
		});

		if (clinicIdsToFetch.size > 0) {
			const namesMap = await fetchClinicNames(db, Array.from(clinicIdsToFetch));
			for (const [clinicId, role] of staffClinicsById.entries()) {
				result.staffClinics.push({
					clinicId,
					role,
					clinicName: namesMap.get(clinicId) ?? null,
				});
			}
		}

		if (xClinicIdHeader) {
			const match = result.staffClinics.find(
				(c) => c.clinicId === xClinicIdHeader,
			);
			if (match) {
				result.resolved.role = match.role;
				result.resolved.clinicId = match.clinicId;
			}
		}

		return result;
	}

	const patientClinicsMap = await resolvePatientClinics(db, uid);
	if (patientClinicsMap.size > 0) {
		const namesMap = await fetchClinicNames(
			db,
			Array.from(patientClinicsMap.keys()),
		);

		for (const [clinicId, patient] of patientClinicsMap.entries()) {
			if (patient.portalAccessEnabled === false) continue;
			result.patientClinics.push({
				clinicId,
				clinicName: namesMap.get(clinicId) ?? null,
				patientId: patient.id,
			});
		}

		const selectedPatientClinic = xClinicIdHeader
			? result.patientClinics.find((p) => p.clinicId === xClinicIdHeader)
			: null;

		if (!result.resolved.role && selectedPatientClinic) {
			result.resolved.role = 'patient';
			result.resolved.clinicId = selectedPatientClinic.clinicId;
			result.resolved.patientId = selectedPatientClinic.patientId;
		} else if (
			!result.resolved.role &&
			result.staffClinics.length === 0 &&
			result.patientClinics.length === 1
		) {
			const p = result.patientClinics[0]!;
			result.resolved.role = 'patient';
			result.resolved.clinicId = p.clinicId;
			result.resolved.patientId = p.patientId;
		}
	}

	return result;
}

async function resolvePatientClinics(
	db: Firestore,
	uid: string,
): Promise<Map<string, { id: string } & PatientDoc>> {
	const map = new Map<string, { id: string } & PatientDoc>();

	const patientsSnap = await db
		.collection('patients')
		.where('linkedUid', '==', uid)
		.get();

	patientsSnap.forEach((doc: QueryDocumentSnapshot) => {
		const patient = doc.data() as PatientDoc;
		if (!patient.clinicId || patient.status !== 'active') return;
		if (!map.has(patient.clinicId)) {
			map.set(patient.clinicId, { id: doc.id, ...patient });
			return;
		}

		console.warn(
			`[Session] Duplicate patient record for uid ${uid} in clinic ${
				patient.clinicId
			}. Using ${map.get(patient.clinicId)?.id}`,
		);
	});

	const appointmentsSnap = await db
		.collection('appointments')
		.where('patientUid', '==', uid)
		.limit(100)
		.get();

	for (const appointmentDoc of appointmentsSnap.docs) {
		const appointment = appointmentDoc.data() as {
			clinicId?: string;
			patientId?: string;
		};
		if (!appointment.clinicId || !appointment.patientId) continue;
		if (map.has(appointment.clinicId)) continue;

		const patientDoc = await db.collection('patients').doc(appointment.patientId).get();
		if (!patientDoc.exists) continue;

		const patient = patientDoc.data() as PatientDoc;
		if (patient.clinicId !== appointment.clinicId || patient.status !== 'active') {
			continue;
		}

		map.set(appointment.clinicId, { id: patientDoc.id, ...patient });
	}

	return map;
}

async function fetchClinicNames(
	db: Firestore,
	ids: string[],
): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (ids.length === 0) return map;

	const refs = ids.map((id) => db.collection('clinics').doc(id));
	const snaps = await db.getAll(...refs);

	snaps.forEach((snap: DocumentSnapshot) => {
		if (!snap.exists) return;
		const d = snap.data() as { name?: string } | undefined;
		map.set(snap.id, d?.name ?? 'Sin nombre');
	});

	return map;
}

export async function resolveSessionContext(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	try {
		const xClinicId = req.header('x-clinic-id') as string | undefined;
		const analysis = await analyzeUserSession(
			req.auth.uid,
			xClinicId,
			req.auth.isPlatformAdmin,
		);

		if (analysis.resolved.role) {
			req.auth.role = analysis.resolved.role;
		}

		if (analysis.resolved.clinicId) {
			req.auth.clinicId = analysis.resolved.clinicId;
			if (analysis.resolved.role === 'patient' && analysis.resolved.patientId) {
				req.patientContext = {
					clinicId: analysis.resolved.clinicId,
					patientId: analysis.resolved.patientId,
				};
			}
		}

		if (analysis.patientClinics.length > 1 && !analysis.resolved.clinicId) {
			return res.status(403).json({
				success: false,
				message:
					'Multiple clinics found. Please provide a valid x-clinic-id header.',
			});
		}

		return next();
	} catch (error) {
		console.error('Session resolution error:', error);
		return res
			.status(500)
			.json({ success: false, message: 'Internal session error' });
	}
}
