// apps/api/src/middlewares/resolveSessionContext.ts

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

/**
 * Estructura de resultado del análisis de sesión.
 * Usada tanto por el endpoint /session como por el middleware.
 */
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

/**
 * Función centralizada que lee de Firestore y determina la situación del usuario.
 * No genera side-effects en req/res, solo devuelve datos.
 */
export async function analyzeUserSession(
	uid: string,
	xClinicIdHeader: string | undefined,
	isPlatformAdmin: boolean = false, // <-- NUEVO PARÁMETRO
): Promise<SessionAnalysisResult> {
	const db = getFirestoreDb();

	const result: SessionAnalysisResult = {
		staffClinics: [],
		patientClinics: [],
		resolved: { role: null, clinicId: null, patientId: null },
	};

	// --- INICIO MODO DIOS (isPlatformAdmin) ---
	if (isPlatformAdmin) {
		if (xClinicIdHeader) {
			// Si el frontend envía el header, le damos acceso total a esa clínica
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
			return result; // Salimos temprano
		} else {
			// Si no hay header, pre-cargamos las clínicas para el selector (límite 50)
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
			return result; // Salimos temprano
		}
	}
	// --- FIN MODO DIOS ---

	// 1) Buscar Membresías (Prioridad Staff)
	const membershipsSnap = await db
		.collection('clinic_memberships')
		.where('uid', '==', uid)
		.where('isActive', '==', true)
		.get();

	if (!membershipsSnap.empty) {
		const clinicIdsToFetch = new Set<string>();

		membershipsSnap.forEach((doc: QueryDocumentSnapshot) => {
			const data = doc.data() as ClinicMembershipDoc;
			clinicIdsToFetch.add(data.clinicId);

			result.staffClinics.push({
				clinicId: data.clinicId,
				role: data.role,
				clinicName: null,
			});
		});

		// Fetch nombres de clínicas
		if (clinicIdsToFetch.size > 0) {
			const namesMap = await fetchClinicNames(db, Array.from(clinicIdsToFetch));
			result.staffClinics.forEach((item) => {
				item.clinicName = namesMap.get(item.clinicId) ?? null;
			});
		}

		// Lógica STAFF:
		if (xClinicIdHeader) {
			const match = result.staffClinics.find(
				(c) => c.clinicId === xClinicIdHeader,
			);
			if (match) {
				result.resolved.role = match.role;
				result.resolved.clinicId = match.clinicId;
			}
		}

		return result; // Staff tiene prioridad sobre Patient.
	}

	// 2) Buscar Pacientes (Si no es Staff)
	const patientsSnap = await db
		.collection('patients')
		.where('linkedUid', '==', uid)
		.get();

	if (!patientsSnap.empty) {
		const clinicIdsToFetch = new Set<string>();

		// Dedup por clinicId: clinicId -> PatientDoc(+id)
		const uniquePatientsMap = new Map<string, { id: string } & PatientDoc>();

		patientsSnap.forEach((doc: QueryDocumentSnapshot) => {
			const pData = doc.data() as PatientDoc;

			if (pData.clinicId && !uniquePatientsMap.has(pData.clinicId)) {
				uniquePatientsMap.set(pData.clinicId, { id: doc.id, ...pData });
				clinicIdsToFetch.add(pData.clinicId);
				return;
			}

			if (pData.clinicId) {
				console.warn(
					`[Session] Duplicate patient record for uid ${uid} in clinic ${
						pData.clinicId
					}. Using ${uniquePatientsMap.get(pData.clinicId)?.id}`,
				);
			}
		});

		// Fetch nombres de clínicas
		const namesMap = await fetchClinicNames(db, Array.from(clinicIdsToFetch));

		// Armar patientClinics
		for (const [clinicId, pData] of uniquePatientsMap.entries()) {
			result.patientClinics.push({
				clinicId,
				clinicName: namesMap.get(clinicId) ?? null,
				patientId: pData.id,
			});
		}

		// Lógica PATIENT:
		result.resolved.role = 'patient';

		if (result.patientClinics.length === 1) {
			// Caso único: auto-resolución
			const p = result.patientClinics[0]!;
			result.resolved.clinicId = p.clinicId;
			result.resolved.patientId = p.patientId;
		} else if (xClinicIdHeader) {
			// Caso múltiple: depende del header
			const match = result.patientClinics.find(
				(p) => p.clinicId === xClinicIdHeader,
			);
			if (match) {
				result.resolved.clinicId = match.clinicId;
				result.resolved.patientId = match.patientId;
			}
		}
	}

	return result;
}

/**
 * Helper para traer nombres de clínicas en lote
 */
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

/**
 * Middleware para rutas protegidas (metrics, etc).
 * Asegura que req.auth y req.patientContext estén seteados correctamente.
 */
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

		// PASAMOS EL isPlatformAdmin AL ANALIZADOR
		const analysis = await analyzeUserSession(
			req.auth.uid,
			xClinicId,
			req.auth.isPlatformAdmin,
		);

		// 1) Aplicar Role
		if (analysis.resolved.role) {
			req.auth.role = analysis.resolved.role;
		}

		// 2) Aplicar Contexto (Clinic / Patient)
		if (analysis.resolved.clinicId) {
			req.auth.clinicId = analysis.resolved.clinicId;

			// Si se resolvió como paciente y tenemos patientId, seteamos el contexto especial
			if (analysis.resolved.role === 'patient' && analysis.resolved.patientId) {
				req.patientContext = {
					clinicId: analysis.resolved.clinicId,
					patientId: analysis.resolved.patientId,
				};
			}
		}

		// 3) Validaciones para Pacientes con múltiples clínicas (sin resolución)
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
