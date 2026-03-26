import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { getFirebaseAdmin } from '../firebase/admin.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';
import type { ClinicRole } from '../types/auth.js';

const router = Router();

// --- CONFIGURACIÓN DE NODEMAILER (GMAIL) ---
const transporter = nodemailer.createTransport({
	service: 'gmail',
	auth: {
		user: process.env.EMAIL_USER || 'tu_correo_de_prueba@gmail.com',
		pass: process.env.EMAIL_PASS || 'tu_contraseña_de_aplicacion',
	},
});

const inviteMemberSchema = z.object({
	name: z.string().min(2),
	email: z.string().email(),
	dni: z.string().min(7).max(8),
	role: z.enum(['clinic_admin', 'professional', 'staff']),
});

const createClinicSchema = z.object({
	name: z.string().min(2),
	admin: z.object({
		name: z.string().min(2),
		email: z.string().email(),
		dni: z.string().min(7).max(8),
	}),
});

router.get('/', authMiddleware, async (req: Request, res: Response) => {
	const auth = req.auth!;
	const db = getFirestoreDb();

	if (auth.isPlatformAdmin) {
		const snap = await db
			.collection('clinics')
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();

		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
		return res.status(200).json({ success: true, data: items });
	}

	const membershipsSnap = await db
		.collection('clinic_memberships')
		.where('uid', '==', auth.uid)
		.where('isActive', '==', true)
		.get();

	if (membershipsSnap.empty) {
		return res.status(200).json({ success: true, data: [] });
	}

	const memberships = membershipsSnap.docs.map(
		(d) => d.data() as ClinicMembershipDoc,
	);

	const clinicIds = Array.from(
		new Set(memberships.map((m) => m.clinicId).filter(Boolean)),
	);

	const refs = clinicIds.map((id) => db.collection('clinics').doc(id));
	const clinicDocs = refs.length ? await db.getAll(...refs) : [];

	const clinics = clinicDocs
		.filter((d) => d.exists)
		.map((d) => {
			const data = d.data() as any;
			const membership = memberships.find((m) => m.clinicId === d.id) ?? null;
			return {
				id: d.id,
				name: data?.name ?? null,
				createdAt: data?.createdAt ?? null,
				updatedAt: data?.updatedAt ?? null,
				role: membership?.role ?? null,
			};
		});

	return res.status(200).json({ success: true, data: clinics });
});

router.get(
	'/lookup-user',
	authMiddleware,
	async (req: Request, res: Response) => {
		const dniStr = req.query.dni as string;
		if (!dniStr)
			return res.status(400).json({ success: false, message: 'Missing dni' });

		const dni = parseInt(dniStr, 10);
		if (isNaN(dni))
			return res.status(400).json({ success: false, message: 'Invalid dni' });
		if (dni < 1000000 || dni > 99999999) {
			return res.status(400).json({
				success: false,
				message: 'DNI must be between 1000000 and 99999999',
			});
		}

		const db = getFirestoreDb();
		const snap = await db
			.collection('users')
			.where('dni', '==', dni)
			.limit(1)
			.get();

		if (snap.empty) {
			return res.status(200).json({ success: true, data: null });
		}

		const d = snap.docs[0];
		if (!d) {
			return res.status(200).json({ success: true, data: null });
		}

		const data = d.data();

		return res.status(200).json({
			success: true,
			data: {
				uid: d.id,
				name: data.name,
				email: data.email,
				dni: data.dni,
			},
		});
	},
);

router.post(
	'/',
	authMiddleware,
	requireRole('platform_admin'),
	async (req: Request, res: Response) => {
		const parsed = createClinicSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const db = getFirestoreDb();
		const now = Timestamp.now();
		const clinicRef = db.collection('clinics').doc();

		await clinicRef.set({
			name: parsed.data.name,
			createdAt: now,
			updatedAt: now,
		});

		const dniInt = parseInt(parsed.data.admin.dni, 10);
		if (dniInt < 1000000 || dniInt > 99999999) {
			return res.status(400).json({
				success: false,
				message: 'DNI must be between 1000000 and 99999999',
			});
		}

		const userSnap = await db
			.collection('users')
			.where('dni', '==', dniInt)
			.limit(1)
			.get();

		let uid: string;
		const { auth } = getFirebaseAdmin();

		if (!userSnap.empty) {
			const userDoc = userSnap.docs[0];
			if (!userDoc) throw new Error('Unexpected null doc');
			uid = userDoc.id;

			try {
				await auth.getUser(uid);
			} catch (error: any) {
				if (error.code === 'auth/user-not-found') {
					try {
						const randomPassword = crypto.randomBytes(20).toString('hex');
						await auth.createUser({
							uid: uid,
							email: parsed.data.admin.email,
							displayName: parsed.data.admin.name,
							password: randomPassword,
						});
						const inviteLink = await auth.generatePasswordResetLink(
							parsed.data.admin.email,
						);

						await transporter.sendMail({
							from: '"Nutri Platform" <no-reply@nutriplatform.com>',
							to: parsed.data.admin.email,
							subject: '¡Bienvenido a tu nueva clínica en Nutri Platform!',
							html: `
								<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
									<h2 style="color: #2F8F7B;">¡Hola, ${parsed.data.admin.name}!</h2>
									<p>Tu clínica ha sido configurada exitosamente.</p>
									<p>Haz clic en el botón para establecer tu contraseña y comenzar a gestionar tu espacio:</p>
									<div style="text-align: center; margin: 30px 0;">
										<a href="${inviteLink}" style="background-color: #2F8F7B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Establecer Contraseña</a>
									</div>
								</div>
							`,
						});
					} catch (createErr: any) {
						console.error('No se pudo sanar al usuario:', createErr.message);
					}
				}
			}

			await userDoc.ref.update({
				name: parsed.data.admin.name,
				email: parsed.data.admin.email,
				updatedAt: now,
			});
		} else {
			try {
				const randomPassword = crypto.randomBytes(20).toString('hex');
				const userRecord = await auth.createUser({
					email: parsed.data.admin.email,
					displayName: parsed.data.admin.name,
					password: randomPassword,
				});
				uid = userRecord.uid;

				const inviteLink = await auth.generatePasswordResetLink(
					parsed.data.admin.email,
				);

				await transporter.sendMail({
					from: '"Nutri Platform" <no-reply@nutriplatform.com>',
					to: parsed.data.admin.email,
					subject: '¡Bienvenido a tu nueva clínica en Nutri Platform!',
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
							<h2 style="color: #2F8F7B;">¡Hola, ${parsed.data.admin.name}!</h2>
							<p>Tu clínica ha sido configurada exitosamente.</p>
							<p>Haz clic en el botón para establecer tu contraseña y comenzar a gestionar tu espacio:</p>
							<div style="text-align: center; margin: 30px 0;">
								<a href="${inviteLink}" style="background-color: #2F8F7B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Establecer Contraseña</a>
							</div>
						</div>
					`,
				});
			} catch (error: any) {
				if (error.code === 'auth/email-already-exists') {
					const existingUser = await auth.getUserByEmail(
						parsed.data.admin.email,
					);
					uid = existingUser.uid;
				} else {
					throw error;
				}
			}

			await db.collection('users').doc(uid).set({
				email: parsed.data.admin.email,
				dni: dniInt,
				name: parsed.data.admin.name,
				createdAt: now,
				updatedAt: now,
			});
		}

		await db.collection('clinic_memberships').add({
			clinicId: clinicRef.id,
			uid,
			role: 'clinic_admin',
			isActive: true,
			createdAt: now,
			updatedAt: now,
			createdByUid: req.auth?.uid ?? null,
		});

		return res.status(201).json({
			success: true,
			message: 'Clinic created',
			data: {
				clinicId: clinicRef.id,
				adminUid: uid,
			},
		});
	},
);

router.get('/mine', authMiddleware, async (req: Request, res: Response) => {
	if (!req.auth) {
		return res.status(401).json({ success: false, message: 'Unauthenticated' });
	}

	const db = getFirestoreDb();

	if (req.auth.isPlatformAdmin) {
		const snap = await db
			.collection('clinics')
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();
		const clinics = snap.docs.map((doc) => ({
			clinicId: doc.id,
			role: 'clinic_admin' as ClinicRole,
			clinicName: doc.data().name ?? null,
		}));

		return res.status(200).json({
			success: true,
			data: {
				uid: req.auth.uid,
				email: req.auth.email,
				isPlatformAdmin: true,
				clinics,
			},
		});
	}

	const membershipsSnap = await db
		.collection('clinic_memberships')
		.where('uid', '==', req.auth.uid)
		.where('isActive', '==', true)
		.get();

	const clinics: Array<{
		clinicId: string;
		role: ClinicRole;
		clinicName: string | null;
	}> = [];

	for (const doc of membershipsSnap.docs) {
		const data = doc.data() as ClinicMembershipDoc;
		const clinicSnap = await db.collection('clinics').doc(data.clinicId).get();
		const clinicName = clinicSnap.exists
			? ((clinicSnap.data() as { name?: string })?.name ?? null)
			: null;
		clinics.push({
			clinicId: data.clinicId,
			role: data.role,
			clinicName,
		});
	}

	return res.status(200).json({
		success: true,
		data: {
			uid: req.auth.uid,
			email: req.auth.email,
			isPlatformAdmin: req.auth.isPlatformAdmin,
			clinics,
		},
	});
});

const upsertMemberBody = z.object({
	uid: z.string().min(1),
	role: z.enum(['clinic_admin', 'professional', 'staff']),
	isActive: z.boolean().optional(),
});

router.post(
	'/:clinicId/members',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin', 'staff'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId)
			return res
				.status(400)
				.json({ success: false, message: 'Missing clinicId' });

		const parsed = upsertMemberBody.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const db = getFirestoreDb();
		const now = Timestamp.now();

		const existing = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.where('uid', '==', parsed.data.uid)
			.limit(1)
			.get();

		if (existing.empty) {
			const doc: ClinicMembershipDoc = {
				clinicId,
				uid: parsed.data.uid,
				role: parsed.data.role,
				isActive: parsed.data.isActive ?? true,
				createdAt: now,
				updatedAt: now,
				createdByUid: req.auth?.uid ?? null,
			};
			const ref = db.collection('clinic_memberships').doc();
			await ref.set(doc);
			return res.status(201).json({
				success: true,
				message: 'Member added',
				data: { id: ref.id, ...doc },
			});
		}

		const doc = existing.docs[0];
		if (doc) {
			await db
				.collection('clinic_memberships')
				.doc(doc.id)
				.update({
					role: parsed.data.role,
					isActive: parsed.data.isActive ?? true,
					updatedAt: now,
				});
			return res.status(200).json({
				success: true,
				message: 'Member updated',
				data: {
					id: doc.id,
					...(doc.data() as ClinicMembershipDoc),
					...parsed.data,
					updatedAt: now,
				},
			});
		}
		return res.status(500).json({ success: false });
	},
);

router.post(
	'/:clinicId/invite',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin', 'staff'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId)
			return res
				.status(400)
				.json({ success: false, message: 'Missing clinicId' });

		const parsed = inviteMemberSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Datos inválidos',
				errors: parsed.error.flatten(),
			});
		}

		const db = getFirestoreDb();
		const dniInt = parseInt(parsed.data.dni, 10);
		if (dniInt < 1000000 || dniInt > 99999999) {
			return res.status(400).json({
				success: false,
				message: 'DNI must be between 1000000 and 99999999',
			});
		}

		const userSnap = await db
			.collection('users')
			.where('dni', '==', dniInt)
			.limit(1)
			.get();

		let uid: string;
		const now = Timestamp.now();
		const { auth } = getFirebaseAdmin();

		if (!userSnap.empty) {
			const userDoc = userSnap.docs[0];
			if (!userDoc) throw new Error('Unexpected null doc');
			uid = userDoc.id;

			try {
				await auth.getUser(uid);
			} catch (error: any) {
				if (error.code === 'auth/user-not-found') {
					try {
						const randomPassword = crypto.randomBytes(20).toString('hex');
						await auth.createUser({
							uid: uid,
							email: parsed.data.email,
							displayName: parsed.data.name,
							password: randomPassword,
						});
						const inviteLink = await auth.generatePasswordResetLink(
							parsed.data.email,
						);

						await transporter.sendMail({
							from: '"Nutri Platform" <no-reply@nutriplatform.com>',
							to: parsed.data.email,
							subject: '¡Te han invitado a Nutri Platform!',
							html: `
								<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
									<h2 style="color: #2F8F7B;">¡Hola, ${parsed.data.name}!</h2>
									<p>Te han invitado a unirte como ${parsed.data.role} en Nutri Platform.</p>
									<p>Haz clic en el botón para aceptar la invitación y establecer tu contraseña:</p>
									<div style="text-align: center; margin: 30px 0;">
										<a href="${inviteLink}" style="background-color: #2F8F7B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Aceptar Invitación</a>
									</div>
								</div>
							`,
						});
					} catch (createErr: any) {
						console.error('Error sanando y enviando email:', createErr.message);
					}
				}
			}

			await userDoc.ref.update({
				name: parsed.data.name,
				email: parsed.data.email,
				updatedAt: now,
			});
		} else {
			try {
				const randomPassword = crypto.randomBytes(20).toString('hex');
				const userRecord = await auth.createUser({
					email: parsed.data.email,
					displayName: parsed.data.name,
					password: randomPassword,
				});
				uid = userRecord.uid;

				const inviteLink = await auth.generatePasswordResetLink(
					parsed.data.email,
				);

				await transporter.sendMail({
					from: '"Nutri Platform" <no-reply@nutriplatform.com>',
					to: parsed.data.email,
					subject: '¡Te han invitado a Nutri Platform!',
					html: `
						<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
							<h2 style="color: #2F8F7B;">¡Hola, ${parsed.data.name}!</h2>
							<p>Te han invitado a unirte como ${parsed.data.role} en Nutri Platform.</p>
							<p>Haz clic en el botón para aceptar la invitación y establecer tu contraseña:</p>
							<div style="text-align: center; margin: 30px 0;">
								<a href="${inviteLink}" style="background-color: #2F8F7B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Aceptar Invitación</a>
							</div>
						</div>
					`,
				});
			} catch (error: any) {
				if (error.code === 'auth/email-already-exists') {
					const existingUser = await auth.getUserByEmail(parsed.data.email);
					uid = existingUser.uid;
				} else {
					throw error;
				}
			}

			await db.collection('users').doc(uid).set({
				email: parsed.data.email,
				dni: dniInt,
				name: parsed.data.name,
				createdAt: now,
				updatedAt: now,
			});
		}

		const memSnap = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.where('uid', '==', uid)
			.limit(1)
			.get();

		if (!memSnap.empty) {
			const memDoc = memSnap.docs[0];
			if (memDoc) {
				await memDoc.ref.update({
					role: parsed.data.role,
					isActive: true,
					updatedAt: now,
				});
			}
			return res.status(200).json({
				success: true,
				message: 'Usuario existente asignado a la clínica.',
			});
		} else {
			await db.collection('clinic_memberships').add({
				clinicId,
				uid,
				role: parsed.data.role,
				isActive: true,
				createdAt: now,
				updatedAt: now,
				createdByUid: req.auth?.uid,
			});
			return res.status(201).json({
				success: true,
				message: 'Usuario invitado/creado y asignado.',
			});
		}
	},
);

router.get(
	'/:clinicId/members',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin', 'staff'),
	async (req: Request, res: Response) => {
		const clinicId = req.params.clinicId;
		if (!clinicId)
			return res
				.status(400)
				.json({ success: false, message: 'Missing clinicId' });

		const db = getFirestoreDb();
		const snap = await db
			.collection('clinic_memberships')
			.where('clinicId', '==', clinicId)
			.where('isActive', '==', true)
			.get();

		const members = await Promise.all(
			snap.docs.map(async (d) => {
				const m = d.data() as ClinicMembershipDoc;
				const userSnap = await db.collection('users').doc(m.uid).get();
				const userData = userSnap.exists ? userSnap.data() : {};

				return {
					id: d.id,
					...m,
					name: userData?.name ?? 'Usuario',
					email: userData?.email ?? 'sin-email',
				};
			}),
		);

		return res.status(200).json({ success: true, data: members });
	},
);

export const clinicsRouter = router;
