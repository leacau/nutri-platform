import type { Request, Response, NextFunction } from 'express';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';
import type { PatientDoc } from '../types/patients.js';
import type { Role } from '../types/auth.js';

/**
 * Estructura de resultado del análisis de sesión.
 * Usada tanto por el endpoint /session como por el middleware.
 */
export interface SessionAnalysisResult {
	staffClinics: Array<{ clinicId: string; role: Role; clinicName: string | null }>;
	patientClinics: Array<{ clinicId: string; clinicName: string | null; patientId: string }>;
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
export async function analyzeUserSession(uid: string, xClinicIdHeader: string | undefined): Promise<SessionAnalysisResult> {
	const db = getFirestoreDb();
	
	const result: SessionAnalysisResult = {
		staffClinics: [],
		patientClinics: [],
		resolved: { role: null, clinicId: null, patientId: null }
	};

	// 1. Buscar Membresías (Prioridad Staff)
	const membershipsSnap = await db
		.collection('clinic_memberships')
		.where('uid', '==', uid)
		.where('isActive', '==', true)
		.get();

	if (!membershipsSnap.empty) {
		const clinicIdsToFetch = new Set<string>();
		
		membershipsSnap.forEach(doc => {
			const data = doc.data() as ClinicMembershipDoc;
			clinicIdsToFetch.add(data.clinicId);
			result.staffClinics.push({
				clinicId: data.clinicId,
				role: data.role,
				clinicName: null // Se llenará luego
			});
		});

		// Fetch nombres de clínicas
		if (clinicIdsToFetch.size > 0) {
			const namesMap = await fetchClinicNames(db, Array.from(clinicIdsToFetch));
			result.staffClinics.forEach(item => {
				item.clinicName = namesMap.get(item.clinicId) ?? null;
			});
		}

		// Lógica STAFF:
		// Si mandan header y coincide con una membresía, resolvemos.
		// Si no, queda null (el staff debe elegir explícitamente).
		if (xClinicIdHeader) {
			const match = result.staffClinics.find(c => c.clinicId === xClinicIdHeader);
			if (match) {
				result.resolved.role = match.role;
				result.resolved.clinicId = match.clinicId;
			}
		} else if (result.staffClinics.length === 1) {
			// Opcional: Si solo tiene 1 clínica staff, podríamos auto-resolver. 
			// Pero tu regla "C" dice: NO setear req.auth.clinicId automáticamente si tiene varias.
			// Asumimos que si tiene 1, es cómodo resolverlo, pero para ser estrictos con "el front elige",
			// dejamos clinicId null salvo que venga el header.
			// (Para mantener consistencia estricta con tu pedido, solo resolvemos si hay header).
		}

		return result; // Terminamos, Staff tiene prioridad sobre Patient.
	}

	// 2. Buscar Pacientes (Si no es Staff)
	const patientsSnap = await db
		.collection('patients')
		.where('linkedUid', '==', uid)
		.get();

	if (!patientsSnap.empty) {
		const clinicIdsToFetch = new Set<string>();
		// Mapa para deduplicar: clinicId -> PatientDoc
		const uniquePatientsMap = new Map<string, { id: string } & PatientDoc>();

		patientsSnap.forEach(doc => {
			const pData = doc.data() as PatientDoc;
			if (pData.clinicId && !uniquePatientsMap.has(pData.clinicId)) {
				// Tomamos el primero que aparezca para esa clínica (determinístico por orden de llegada de Firestore)
				uniquePatientsMap.set(pData.clinicId, { id: doc.id, ...pData });
				clinicIdsToFetch.add(pData.clinicId);
			} else if (pData.clinicId) {
				console.warn(`[Session] Duplicate patient record for uid ${uid} in clinic ${pData.clinicId}. Using ${uniquePatientsMap.get(pData.clinicId)?.id}`);
			}
		});

		// Fetch nombres
		const namesMap = await fetchClinicNames(db, Array.from(clinicIdsToFetch));

		// Armar patientClinics
		for (const [cId, pData] of uniquePatientsMap.entries()) {
			result.patientClinics.push({
				clinicId: cId,
				clinicName: namesMap.get(cId) ?? null,
				patientId: pData.id
			});
		}

		// Lógica PATIENT:
		result.resolved.role = 'patient'; // Siempre es patient si llegamos acá

		if (result.patientClinics.length === 1) {
			// Caso Unico: Auto-resolución
			const p = result.patientClinics[0]!;
			result.resolved.clinicId = p.clinicId;
			result.resolved.patientId = p.patientId;
		} else {
			// Caso Múltiple: Depende del header
			if (xClinicIdHeader) {
				const match = result.patientClinics.find(p => p.clinicId === xClinicIdHeader);
				if (match) {
					result.resolved.clinicId = match.clinicId;
					result.resolved.patientId = match.patientId;
				}
				// Si no matchea, queda clinicId=null -> Error 403 en middleware
			}
		}
	}

	return result;
}

/**
 * Helper para traer nombres de clínicas en lote
 */
async function fetchClinicNames(db: FirebaseFirestore.Firestore, ids: string[]): Promise<Map<string, string>> {
	const map = new Map<string, string>();
	if (ids.length === 0) return map;
	
	const refs = ids.map(id => db.collection('clinics').doc(id));
	const snaps = await db.getAll(...refs);
	
	snaps.forEach(snap => {
		if (snap.exists) {
			const d = snap.data() as { name?: string };
			map.set(snap.id, d.name ?? 'Sin nombre');
		}
	});
	return map;
}

/**
 * Middleware para rutas protegidas (metrics, etc).
 * Asegura que req.auth y req.patientContext estén seteados correctamente.
 */
export async function resolveSessionContext(req: Request, res: Response, next: NextFunction) {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	try {
		const xClinicId = req.header('x-clinic-id') as string | undefined;
		const analysis = await analyzeUserSession(req.auth.uid, xClinicId);

		// 1. Aplicar Role
		if (analysis.resolved.role) {
			req.auth.role = analysis.resolved.role;
		}

		// 2. Aplicar Contexto (Clinic / Patient)
		if (analysis.resolved.clinicId) {
			req.auth.clinicId = analysis.resolved.clinicId;

			// Si se resolvió como paciente y tenemos patientId, seteamos el contexto especial
			if (analysis.resolved.role === 'patient' && analysis.resolved.patientId) {
				req.patientContext = {
					clinicId: analysis.resolved.clinicId,
					patientId: analysis.resolved.patientId
				};
			}
		}

		// 3. Validaciones para Pacientes con múltiples clínicas
		// Si es patient, tiene múltiples opciones, pero NO se logró resolver (falta header o header inválido)
		if (analysis.patientClinics.length > 1 && !analysis.resolved.clinicId) {
			// Solo bloqueamos si el rol detectado es patient, ya que para Staff el null es válido hasta que elijan
			// (aunque para rutas protegidas Staff también fallará luego en requireClinicContext).
			// Pero tu requerimiento B dice explícitamente responder error aquí.
			return res.status(403).json({ 
				success: false, 
				message: 'Multiple clinics found. Please provide a valid x-clinic-id header.' 
			});
		}

		return next();
	} catch (error) {
		console.error('Session resolution error:', error);
		return res.status(500).json({ success: false, message: 'Internal session error' });
	}
}
