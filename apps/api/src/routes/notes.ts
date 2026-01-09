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
	requireRole('clinic_admin', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId ?? req.header('x-clinic-id') ?? null;
		if (!clinicId) return denyAuthz(req, res, 'Missing clinicId for notes');

		const parsed = createNoteSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(
			db,
			'patients',
			parsed.data.patientId,
			clinicId
		);

		let safePatient: (PatientDoc & { id: string }) | null = null;

		if (patient) {
			// Corrección: Construimos el objeto explícitamente para evitar conflictos de tipo con 'id'
			safePatient = {
				...patient,
				id: parsed.data.patientId,
			};
		} else {
			// Intento de búsqueda global si soy el profesional asignado
			const globalSnap = await db
				.collection('patients')
				.doc(parsed.data.patientId)
				.get();
			if (globalSnap.exists) {
				const pData = globalSnap.data() as PatientDoc;
				if (
					auth.role === 'professional' &&
					(pData.assignedProfessionalUids ?? []).includes(auth.uid)
				) {
					safePatient = {
						...pData,
						id: globalSnap.id,
					};
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
			clinicId,
			patientId: safePatient.id,
			professionalUid:
				auth.role === 'professional'
					? auth.uid
					: (safePatient.assignedProfessionalUids ?? [])[0] ?? auth.uid,
			content: parsed.data.content,
			visibility: parsed.data.visibility,
			createdAt: now,
		};

		const ref = await db.collection('notes').add(note);
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
	// Sin requireClinicContext estricto para permitir búsqueda global
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

		// Consulta base
		const query = db
			.collection('notes')
			.where('patientId', '==', patientId)
			.orderBy('createdAt', 'desc')
			.limit(100);

		const snap = await query.get();

		const items = snap.docs
			.map((d) => ({ id: d.id, ...(d.data() as ClinicalNoteDoc) }))
			.filter((note) => {
				// 1. Platform Admin siempre ve todo
				if (auth.isPlatformAdmin) return true;

				// 2. Profesional: ve todas las notas que él creó (sin importar la clínica)
				if (auth.role === 'professional' && note.professionalUid === auth.uid)
					return true;

				// 3. Colaboración: ve notas creadas en su clínica activa actual
				if (auth.clinicId && note.clinicId === auth.clinicId) return true;

				// 4. Paciente: ve notas compartidas
				if (auth.role === 'patient' && note.visibility === 'shared')
					return true;

				return false;
			});

		return res.status(200).json({ success: true, data: items });
	}
);

export const notesRouter = router;
