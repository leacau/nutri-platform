import type { Request, Response } from 'express';

import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { getFirebaseAdmin } from '../firebase/admin.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import nodemailer from 'nodemailer';
import { z } from 'zod';

// --- CONFIGURACIÓN DE NODEMAILER (GMAIL) ---
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER || 'tu_correo_de_prueba@gmail.com', // CONFIGURAR EN CLOUD RUN
		pass: process.env.EMAIL_PASS || 'tu_contraseña_de_aplicacion', // CONFIGURAR EN CLOUD RUN
	},
});

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

		// 6. ENVÍO DE EMAIL REAL
		try {
			await transporter.sendMail({
				from: '"Nutri Platform" <no-reply@nutriplatform.com>',
				to: email,
				subject: '¡Te han invitado a unirte a Nutri Platform!',
				html: `
					<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
						<h2 style="color: #2F8F7B;">¡Hola, ${fullName}!</h2>
						<p>Te han invitado a formar parte del equipo en <strong>Nutri Platform</strong>.</p>
						<p>Para aceptar la invitación y configurar tu contraseña de acceso, por favor haz clic en el siguiente botón:</p>
						<div style="text-align: center; margin: 30px 0;">
							<a href="${inviteLink}" style="background-color: #2F8F7B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Aceptar Invitación</a>
						</div>
						<p style="color: #666; font-size: 0.9em;">Si tienes problemas con el botón, copia y pega el siguiente enlace en tu navegador:</p>
						<p style="color: #666; font-size: 0.8em; word-break: break-all;">${inviteLink}</p>
					</div>
				`,
			});
			console.log(`\n✅ [EMAIL ENVIADO] Invitación entregada a: ${email}\n`);
		} catch (emailError) {
			console.error(
				`\n❌ [ERROR EMAIL] Falló el envío a ${email}:`,
				emailError,
			);
		}

		return res.status(200).json({
			success: true,
			message: 'Usuario invitado correctamente.',
			data: {
				uid,
				inviteLink,
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
