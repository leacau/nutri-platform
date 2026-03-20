import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import crypto from 'crypto';

import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';

export const clinicalRecordsRouter = Router();

// ============================================================================
// 🔒 MOTOR DE ENCRIPTACIÓN AES-256-GCM (Grado Médico)
// ============================================================================
// ATENCIÓN: En producción, ESTA CLAVE DEBE VENIR DEL .env (process.env.CLINICAL_ENCRYPTION_KEY)
// Debe ser exactamente de 32 bytes (256 bits). Para este código usamos un fallback seguro.
const getEncryptionKey = () => {
	if (process.env.CLINICAL_ENCRYPTION_KEY) {
		return Buffer.from(process.env.CLINICAL_ENCRYPTION_KEY, 'hex');
	}
	// Fallback de desarrollo: Genera una clave a partir de un string estático
	return crypto.scryptSync('nutri_platform_super_secret_dev_key', 'salt', 32);
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function encryptData(data: any): string {
	const text = JSON.stringify(data);
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
	let encrypted = cipher.update(text, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	const authTag = cipher.getAuthTag().toString('hex');
	// Guardamos el Vector de Inicialización, el Tag de Autenticación y el texto cifrado
	return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptData(encryptedText: string | any): any {
	// Si la data no es un string (es un registro viejo sin cifrar), la devolvemos como está
	if (typeof encryptedText !== 'string' || !encryptedText.includes(':')) {
		return encryptedText;
	}

	try {
		const parts = encryptedText.split(':');
		if (parts.length !== 3) return encryptedText;

		// Le juramos a TypeScript que estas variables son strings
		const ivHex = parts[0] as string;
		const authTagHex = parts[1] as string;
		const encryptedHex = parts[2] as string;

		const iv = Buffer.from(ivHex, 'hex');
		const authTag = Buffer.from(authTagHex, 'hex');

		const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
		decipher.setAuthTag(authTag);

		// Tipamos explícitamente como string para evitar el error de NonSharedBuffer
		let decrypted: string = decipher.update(encryptedHex, 'hex', 'utf8');
		decrypted += decipher.final('utf8');

		return JSON.parse(decrypted);
	} catch (error) {
		console.error('Error crítico descifrando registro médico:', error);
		return {
			error: 'DATA_CORRUPTED_OR_KEY_MISMATCH',
			content: 'No se pudo descifrar el registro.',
		};
	}
}

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
	data: z.record(z.any()), // Este es el objeto que vamos a encriptar
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

		const patientSnap = await db.collection('patients').doc(patientId).get();
		if (!patientSnap.exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Patient not found' });
		}

		if (patientSnap.data()?.clinicId !== clinicId) {
			return denyAuthz(req, res, 'Cross-clinic access denied');
		}

		// 🔒 REGLA DE HIERRO: Solo traemos los registros donde professionalUid == tu UID.
		// No importa si sos clinic_admin o superuser, la consulta en Firebase filtra por tu ID.
		const recordsSnap = await db
			.collection('clinical_records')
			.where('clinicId', '==', clinicId)
			.where('patientId', '==', patientId)
			.where('professionalUid', '==', auth.uid)
			.orderBy('date', 'desc')
			.get();

		const records = recordsSnap.docs.map((doc) => {
			const rawData = doc.data();
			return {
				id: doc.id,
				...rawData,
				// 🔓 Desciframos la data en memoria justo antes de mandarla al frontend
				data: decryptData(rawData.encryptedData || rawData.data),
				createdAt:
					rawData.createdAt instanceof Timestamp
						? rawData.createdAt.toDate().toISOString()
						: rawData.createdAt,
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

		const patientSnap = await db.collection('patients').doc(patientId).get();
		if (!patientSnap.exists || patientSnap.data()?.clinicId !== clinicId) {
			return res
				.status(404)
				.json({ success: false, message: 'Patient not found in clinic' });
		}

		const now = Timestamp.now();

		// 🔒 Encriptamos el contenido sensible antes de armar el registro
		const encryptedPayload = encryptData(data);

		const record = {
			clinicId,
			patientId,
			professionalUid: auth.uid,
			type,
			date,
			encryptedData: encryptedPayload, // Guardamos la basura criptográfica
			createdAt: now,
			updatedAt: now,
		};

		const ref = await db.collection('clinical_records').add(record);

		return res.status(201).json({
			success: true,
			message: 'Record created successfully',
			// Devolvemos la data original al frontend (no la encriptada) para que no haya que recargar
			data: {
				id: ref.id,
				clinicId,
				patientId,
				professionalUid: auth.uid,
				type,
				date,
				data,
				createdAt: now.toDate().toISOString(),
			},
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

		if (recordData.clinicId !== clinicId) {
			return denyAuthz(req, res, 'Cross-clinic edit attempt denied');
		}

		// 🔒 REGLA DE HIERRO: Nadie puede editar si no es el creador original
		if (recordData.professionalUid !== auth.uid) {
			return denyAuthz(
				req,
				res,
				'Nadie puede editar un registro que no haya firmado personalmente.',
			);
		}

		const { data, date } = req.body;
		const updates: any = { updatedAt: Timestamp.now() };

		// Si mandan data nueva, la encriptamos antes de pisar la base de datos
		if (data !== undefined) updates.encryptedData = encryptData(data);
		if (date !== undefined) updates.date = date;

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

		if (recordData.clinicId !== clinicId) {
			return denyAuthz(req, res, 'Cross-clinic delete attempt denied');
		}

		// 🔒 REGLA DE HIERRO: Nadie puede borrar si no es el creador original
		if (recordData.professionalUid !== auth.uid) {
			return denyAuthz(
				req,
				res,
				'Nadie puede borrar un registro que no haya firmado personalmente.',
			);
		}

		await recordRef.delete();

		return res.status(200).json({
			success: true,
			message: 'Record deleted successfully',
			data: { id: recordId },
		});
	},
);
