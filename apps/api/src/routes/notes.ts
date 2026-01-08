import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import { getDocInClinic } from '../security/getDocInClinic.js';
import type { PatientDoc } from '../types/patients.js';
import type { ClinicalNoteDoc } from '../types/notes.js';

const router = Router();

const createNoteSchema = z.object({
	patientId: z.string().min(1),
	content: z.string().min(1),
	visibility: z.enum(['private', 'shared']).default('private'),
});

router.post(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'nutri'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId ?? req.header('x-clinic-id') ?? null;
		if (!clinicId) return denyAuthz(req, res, 'Missing clinicId for notes');

		const parsed = createNoteSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res
				.status(400)
				.json({
					success: false,
					message: 'Invalid body',
					errors: parsed.error.flatten(),
				});
		}

		const db = getFirestoreDb();
		// NOTA: Aquí podríamos relajar getDocInClinic si queremos permitir notas sobre pacientes de otras clínicas,
		// pero por seguridad al CREAR, mantenemos que el paciente debe estar visible en la clínica actual o asignado.
		// Si falla, es porque el paciente no está en la clínica activa.
		// Dado que el POST /patients reasigna la clínica, esto debería funcionar bien.
		const patient = await getDocInClinic<PatientDoc>(
			db,
			'patients',
			parsed.data.patientId,
			clinicId
		);

		// Si no lo encuentra en la clínica, y soy el nutri asignado, podríamos buscarlo globalmente:
		let safePatient: (PatientDoc & { id: string }) | null = patient
			? { id: parsed.data.patientId, ...patient }
			: null;

		if (!safePatient) {
			// Intento de búsqueda global si soy el nutri asignado
			const globalSnap = await db
				.collection('patients')
				.doc(parsed.data.patientId)
				.get();
			if (globalSnap.exists) {
				const pData = globalSnap.data() as PatientDoc;
				if (auth.role === 'nutri' && pData.assignedNutriUid === auth.uid) {
					safePatient = { id: globalSnap.id, ...pData };
				}
			}
		}

		if (!safePatient)
			return res
				.status(404)
				.json({
					success: false,
					message: 'Patient not found or access denied',
				});

		const now = Timestamp.now();
		const note: ClinicalNoteDoc = {
			clinicId, // Se guarda con la clínica donde se crea (la activa)
			patientId: safePatient.id,
			nutriUid:
				auth.role === 'nutri'
					? auth.uid
					: safePatient.assignedNutriUid ?? auth.uid,
			content: parsed.data.content,
			visibility: parsed.data.visibility,
			createdAt: now,
		};

		const ref = await db.collection('notes').add(note);
		// Autor: siempre quien está logueado
		// (Asegurate de que ClinicalNoteDoc tenga authorUid si quieres trackearlo explícitamente,
		// aunque nutriUid suele actuar de autor en este modelo simple)

		return res
			.status(201)
			.json({
				success: true,
				message: 'Note added',
				data: { id: ref.id, ...note },
			});
	}
);

router.get(
	'/',
	authMiddleware,
	// Quitamos requireClinicContext estricto para permitir búsqueda global de "mis notas"
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const db = getFirestoreDb();
		const patientId = req.query.patientId as string | undefined;

		if (!patientId) {
			return res
				.status(400)
				.json({
					success: false,
					message: 'patientId is required to list notes',
				});
		}

		// Consulta base: Notas del paciente
		const query = db
			.collection('notes')
			.where('patientId', '==', patientId)
			.orderBy('createdAt', 'desc')
			.limit(100);

		const snap = await query.get();

		// Filtrado en memoria:
		// 1. Si yo la creé (nutriUid == auth.uid), la veo.
		// 2. Si soy admin/staff de la clínica DONDE se creó la nota, la veo.
		// 3. Si soy paciente y es visibility 'shared', la veo.

		const items = snap.docs
			.map((d) => ({ id: d.id, ...(d.data() as ClinicalNoteDoc) }))
			.filter((note) => {
				// Caso Platform Admin
				if (auth.isPlatformAdmin) return true;

				// Caso Nutri (Dueño de la nota) -> REGLA 3: Traerse todas las fichas creadas por él.
				if (auth.role === 'nutri' && note.nutriUid === auth.uid) return true;

				// Caso Colaboración (Misma clínica activa)
				if (auth.clinicId && note.clinicId === auth.clinicId) return true;

				// Caso Paciente
				if (auth.role === 'patient' && note.visibility === 'shared')
					return true;

				return false;
			});

		return res.status(200).json({ success: true, data: items });
	}
);

export const notesRouter = router;
