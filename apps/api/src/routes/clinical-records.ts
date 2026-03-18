import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';

export const clinicalRecordsRouter = Router();

// Validación estricta para garantizar la estructura de los datos
const createRecordSchema = z.object({
	patientId: z.string().min(1),
	type: z.enum([
		'note',
		'measurement',
		'dynamic_measurement',
		'prescription',
		'meal_plan',
		'attachment',
	]),
	date: z.string().min(10),
	data: z.record(z.any()),
});

// GET: Obtener todos los registros de un paciente en una clínica
clinicalRecordsRouter.get(
	'/patient/:patientId',
	requireClinicContext,
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const { patientId } = req.params;

		if (!patientId) {
			return res
				.status(400)
				.json({ success: false, message: 'Missing patient ID' });
		}

		const db = getFirestoreDb();

		// 1. Verificamos que el usuario tiene acceso a este paciente
		const patientSnap = await db.collection('patients').doc(patientId).get();
		if (!patientSnap.exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Patient not found' });
		}

		const patientData = patientSnap.data();
		if (patientData?.clinicId !== clinicId) {
			return denyAuthz(req, res, 'Cross-clinic access denied');
		}

		if (
			auth.role === 'professional' &&
			!(patientData?.assignedProfessionalUids ?? []).includes(auth.uid)
		) {
			return denyAuthz(req, res, 'Professional not assigned to this patient');
		}

		// 2. Traemos el historial (lo más nuevo primero)
		const recordsSnap = await db
			.collection('clinical_records')
			.where('clinicId', '==', clinicId)
			.where('patientId', '==', patientId)
			.orderBy('date', 'desc')
			.get();

		const records = recordsSnap.docs.map((doc) => {
			const data = doc.data();
			return {
				id: doc.id,
				...data,
				createdAt:
					data.createdAt instanceof Timestamp
						? data.createdAt.toDate().toISOString()
						: data.createdAt,
			};
		});

		return res.status(200).json({ success: true, data: records });
	},
);

// POST: Crear un nuevo registro en el historial
clinicalRecordsRouter.post(
	'/',
	requireClinicContext,
	requireRole('clinic_admin', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;

		const parsed = createRecordSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const { patientId, type, date, data } = parsed.data;
		const db = getFirestoreDb();

		// Verificar acceso al paciente
		const patientSnap = await db.collection('patients').doc(patientId).get();
		if (!patientSnap.exists || patientSnap.data()?.clinicId !== clinicId) {
			return res
				.status(404)
				.json({ success: false, message: 'Patient not found in clinic' });
		}

		if (
			auth.role === 'professional' &&
			!(patientSnap.data()?.assignedProfessionalUids ?? []).includes(auth.uid)
		) {
			return denyAuthz(req, res, 'Cannot add record to unassigned patient');
		}

		const now = Timestamp.now();
		const record = {
			clinicId,
			patientId,
			professionalUid: auth.uid,
			type,
			date,
			data,
			createdAt: now,
			updatedAt: now,
		};

		const ref = await db.collection('clinical_records').add(record);

		return res.status(201).json({
			success: true,
			message: 'Record created successfully',
			data: { id: ref.id, ...record, createdAt: now.toDate().toISOString() },
		});
	},
);

// PATCH: Editar un registro clínico
clinicalRecordsRouter.patch(
	'/:recordId',
	requireClinicContext,
	requireRole('clinic_admin', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const { recordId } = req.params;

		if (!recordId) {
			return res
				.status(400)
				.json({ success: false, message: 'Missing record ID' });
		}

		const db = getFirestoreDb();
		const recordRef = db.collection('clinical_records').doc(recordId);
		const recordSnap = await recordRef.get();

		if (!recordSnap.exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Record not found' });
		}

		const recordData = recordSnap.data()!;

		// 1. Validar que el registro pertenezca a la clínica del usuario
		if (recordData.clinicId !== clinicId) {
			return denyAuthz(req, res, 'Cross-clinic edit attempt denied');
		}

		// 2. Si es profesional, validar que él haya creado el registro
		if (
			auth.role === 'professional' &&
			recordData.professionalUid !== auth.uid
		) {
			return denyAuthz(
				req,
				res,
				'Professionals can only edit their own records',
			);
		}

		// 3. Extraer solo los campos permitidos para actualizar (data y date)
		const { data, date } = req.body;

		const updates: any = {
			updatedAt: Timestamp.now(),
		};

		if (data !== undefined) updates.data = data;
		if (date !== undefined) updates.date = date;

		// 4. Guardar los cambios
		await recordRef.update(updates);

		return res.status(200).json({
			success: true,
			message: 'Record updated successfully',
			data: { id: recordId, ...updates },
		});
	},
);

// DELETE: Eliminar un registro clínico
clinicalRecordsRouter.delete(
	'/:recordId',
	requireClinicContext,
	requireRole('clinic_admin', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const { recordId } = req.params;

		if (!recordId) {
			return res
				.status(400)
				.json({ success: false, message: 'Missing record ID' });
		}

		const db = getFirestoreDb();
		const recordRef = db.collection('clinical_records').doc(recordId);
		const recordSnap = await recordRef.get();

		if (!recordSnap.exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Record not found' });
		}

		const recordData = recordSnap.data()!;

		// 1. Validar que el registro pertenezca a la clínica del usuario
		if (recordData.clinicId !== clinicId) {
			return denyAuthz(req, res, 'Cross-clinic delete attempt denied');
		}

		// 2. Si es profesional, validar que él haya creado el registro (o que sea admin)
		if (
			auth.role === 'professional' &&
			recordData.professionalUid !== auth.uid
		) {
			return denyAuthz(
				req,
				res,
				'Professionals can only delete their own records',
			);
		}

		// 3. Borrar el registro
		await recordRef.delete();

		return res.status(200).json({
			success: true,
			message: 'Record deleted successfully',
			data: { id: recordId },
		});
	},
);
