import type {
	DocumentSnapshot,
	Firestore,
	QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import type { NextFunction, Request, Response } from 'express';

import type { ClinicBilling, ClinicMembershipDoc } from '../types/clinics.js';
import type { PatientDoc } from '../types/patients.js';
import type { ClinicCapability, Role } from '../types/auth.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import {
	compareClinicRoles,
	isClinicRole,
} from '../security/clinicRolePriority.js';
import {
	defaultCapabilitiesForRole,
	mergeMembershipCapabilities,
} from '../security/clinicCapabilities.js';
import { normalizeBilling } from '../billing/plans.js';

export interface SessionAnalysisResult {
	staffClinics: Array<{
		clinicId: string;
		role: Role;
		clinicName: string | null;
		tenantType?: 'clinic' | 'individual_practice';
		ownerProfessionalUid?: string | null;
		billing?: ClinicBilling;
		capabilities?: ClinicCapability[];
	}>;
	patientClinics: Array<{
		clinicId: string;
		clinicName: string | null;
		patientId: string;
		tenantType?: 'clinic' | 'individual_practice';
		ownerProfessionalUid?: string | null;
		billing?: ClinicBilling;
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
					tenantType: (clinicDoc.data() as any)?.tenantType ?? 'clinic',
					ownerProfessionalUid:
						(clinicDoc.data() as any)?.ownerProfessionalUid ?? null,
					billing: normalizeBilling(
						(clinicDoc.data() as any)?.billing,
						(clinicDoc.data() as any)?.tenantType === 'individual_practice'
							? 'individual'
							: 'starter_1_5',
					),
					capabilities: defaultCapabilitiesForRole('clinic_admin'),
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
			const data = doc.data() as any;
			result.staffClinics.push({
				clinicId: doc.id,
				role: 'clinic_admin',
				clinicName: data?.name ?? 'Sin nombre',
				tenantType: data?.tenantType ?? 'clinic',
				ownerProfessionalUid: data?.ownerProfessionalUid ?? null,
				billing: normalizeBilling(
					data?.billing,
					data?.tenantType === 'individual_practice'
						? 'individual'
						: 'starter_1_5',
				),
				capabilities: defaultCapabilitiesForRole('clinic_admin'),
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
		const membershipsByClinic = new Map<string, ClinicMembershipDoc[]>();

		membershipsSnap.forEach((doc: QueryDocumentSnapshot) => {
			const data = doc.data() as ClinicMembershipDoc;
			if (!isClinicRole(data.role)) return;

			clinicIdsToFetch.add(data.clinicId);
			const clinicMemberships = membershipsByClinic.get(data.clinicId) ?? [];
			clinicMemberships.push(data);
			membershipsByClinic.set(data.clinicId, clinicMemberships);

			const current = staffClinicsById.get(data.clinicId);
			if (
				!current ||
				(isClinicRole(current) && compareClinicRoles(data.role, current) > 0)
			) {
				staffClinicsById.set(data.clinicId, data.role);
			}
		});

		if (clinicIdsToFetch.size > 0) {
			const clinicsMap = await fetchClinicSummaries(
				db,
				Array.from(clinicIdsToFetch),
			);
			for (const [clinicId, role] of staffClinicsById.entries()) {
				const clinic = clinicsMap.get(clinicId);
				result.staffClinics.push({
					clinicId,
					role,
					clinicName: clinic?.name ?? null,
					tenantType: clinic?.tenantType ?? 'clinic',
					ownerProfessionalUid: clinic?.ownerProfessionalUid ?? null,
					billing:
						clinic?.billing ??
						normalizeBilling(undefined, 'starter_1_5'),
					capabilities: mergeMembershipCapabilities(
						membershipsByClinic.get(clinicId) ?? [],
					),
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
			const clinicsMap = await fetchClinicSummaries(
			db,
			Array.from(patientClinicsMap.keys()),
		);

		for (const [clinicId, patient] of patientClinicsMap.entries()) {
			if (patient.portalAccessEnabled === false) continue;
			result.patientClinics.push({
				clinicId,
				clinicName: clinicsMap.get(clinicId)?.name ?? null,
				patientId: patient.id,
				tenantType: clinicsMap.get(clinicId)?.tenantType ?? 'clinic',
				ownerProfessionalUid:
					clinicsMap.get(clinicId)?.ownerProfessionalUid ?? null,
				billing:
					clinicsMap.get(clinicId)?.billing ??
					normalizeBilling(undefined, 'starter_1_5'),
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

async function fetchClinicSummaries(
	db: Firestore,
	ids: string[],
): Promise<
	Map<
		string,
		{
			name: string;
			tenantType: 'clinic' | 'individual_practice';
			ownerProfessionalUid: string | null;
			billing: ClinicBilling;
		}
	>
> {
	const map = new Map<
		string,
		{
			name: string;
			tenantType: 'clinic' | 'individual_practice';
			ownerProfessionalUid: string | null;
			billing: ClinicBilling;
		}
	>();
	if (ids.length === 0) return map;

	const refs = ids.map((id) => db.collection('clinics').doc(id));
	const snaps = await db.getAll(...refs);

	snaps.forEach((snap: DocumentSnapshot) => {
		if (!snap.exists) return;
		const d = snap.data() as
			| {
					name?: string;
					tenantType?: 'clinic' | 'individual_practice';
					ownerProfessionalUid?: string | null;
					billing?: Partial<ClinicBilling>;
			  }
			| undefined;
		map.set(snap.id, {
			name: d?.name ?? 'Sin nombre',
			tenantType: d?.tenantType ?? 'clinic',
			ownerProfessionalUid: d?.ownerProfessionalUid ?? null,
			billing: normalizeBilling(
				d?.billing,
				d?.tenantType === 'individual_practice' ? 'individual' : 'starter_1_5',
			),
		});
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
			const match = analysis.staffClinics.find(
				(clinic) => clinic.clinicId === analysis.resolved.clinicId,
			);
			if (match?.capabilities) {
				req.auth.clinicCapabilities = match.capabilities;
			}
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
