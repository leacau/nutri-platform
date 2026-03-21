import type { Request, Response } from 'express';

import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { getFirebaseAdmin } from '../firebase/admin.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import { z } from 'zod';

// Validamos los datos de entrada con Zod (manteniendo tu estándar)
const inviteSchema = z.object({
	email: z.string().email(),
	fullName: z.string().min(2),
	role: z.string().min(1),
	clinicId: z.string().optional(),
});

export async function inviteUser(
	req: Request,
	res: Response,
): Promise<Response | void> {
	try {
		const parsed = inviteSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Datos de invitación inválidos',
				errors: parsed.error.flatten(),
			});
		}

		const { email, fullName, role, clinicId } = parsed.data;

		const { auth } = getFirebaseAdmin();
		const db = getFirestoreDb();
		const now = Timestamp.now();

		// 1. Contraseña aleatoria que nadie sabrá nunca
		const randomPassword = crypto.randomBytes(20).toString('hex');

		// 2. Crear usuario en Firebase Auth
		const userRecord = await auth.createUser({
			email,
			displayName: fullName,
			password: randomPassword,
		});

		const uid = userRecord.uid;

		// 3. Guardar el perfil en Firestore
		await db.collection('users').doc(uid).set({
			email,
			name: fullName, // Usamos 'name' para ser consistentes con tu esquema upsertUserSchema
			role,
			isActive: true,
			createdAt: now,
			updatedAt: now,
		});

		// 4. Opcional: Asociarlo a la clínica si se envió el ID
		if (clinicId) {
			await db.collection('clinic_memberships').add({
				uid,
				clinicId,
				role,
				isActive: true,
				createdAt: now,
			});
		}

		// 5. ¡El Link Mágico!
		const inviteLink = await auth.generatePasswordResetLink(email);

		// 6. SIMULACIÓN DE EMAIL (Acá enchufaremos Resend o SendGrid luego)
		console.log(`\n📧 [EMAIL SIMULADO] Enviando invitación a: ${email}`);
		console.log(`🔗 Link de acceso: ${inviteLink}\n`);

		return res.status(200).json({
			success: true,
			message: 'Usuario invitado correctamente.',
			data: {
				uid,
				inviteLink, // Temporal para que lo puedas probar en Postman/Frontend
			},
		});
	} catch (error: any) {
		console.error('[INVITE ERROR] Error invitando usuario:', error);

		if (error.code === 'auth/email-already-exists') {
			return res.status(409).json({
				success: false,
				message: 'El correo ya está registrado en la plataforma.',
			});
		}

		return res.status(500).json({
			success: false,
			message: 'Error interno invitando al usuario.',
			errorDetails: error.message,
		});
	}
}
