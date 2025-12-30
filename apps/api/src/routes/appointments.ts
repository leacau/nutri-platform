import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';

import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireRole } from '../middlewares/requireRole.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { getFirebaseAdmin } from '../firebase/admin.js';
import type { Role } from '../types/auth.js';

export type AppointmentStatus =
	| 'requested'
	| 'scheduled'
	| 'cancelled'
	| 'completed';

export type AppointmentDoc = {
	clinicId: string;

	// Pivotes de aislamiento
	patientId: string; // patients/{id}
	patientUid: string; // auth uid (linkedUid)

	// Selección del nutricionista
	nutriUid: string | null;

	status: AppointmentStatus;

	requestedAt: FirebaseFirestore.Timestamp;
	scheduledFor: FirebaseFirestore.Timestamp | null;

	cancelledAt: FirebaseFirestore.Timestamp | null;
	cancelledByUid: string | null;
	cancelledByRole: Role | null;

	completedAt: FirebaseFirestore.Timestamp | null;
	completedByUid: string | null;
	completedByRole: Role | null;

	createdAt: FirebaseFirestore.Timestamp;
	updatedAt: FirebaseFirestore.Timestamp;
};

const router = Router();

const requestBodySchema = z
	.object({
		nutriUid: z.string().min(1),
	})
	.strict();

const cancelParamsSchema = z.object({ id: z.string().min(1) });
const scheduleParamsSchema = z.object({ id: z.string().min(1) });

const scheduleBodySchema = z
	.object({
		// ISO string desde el front
		scheduledForIso: z.string().min(10),

		// uid del nutri seleccionado
		nutriUid: z.string().min(1),
	})
	.strict();

function mustAuth(req: Request) {
	if (!req.auth) {
		throw Object.assign(new Error('Missing req.auth'), { statusCode: 500 });
	}
	return req.auth;
}

async function getPatientProfileByUid(
	firestore: FirebaseFirestore.Firestore,
	uid: string
): Promise<{ patientId: string; clinicId: string }> {
	const snap = await firestore
		.collection('patients')
		.where('linkedUid', '==', uid)
		.limit(1)
		.get();

	if (snap.empty) {
		throw Object.assign(new Error('Patient profile not linked'), {
			statusCode: 403,
		});
	}

	const doc = snap.docs[0];
	const data = doc.data() as { clinicId?: unknown };

	if (typeof data.clinicId !== 'string' || !data.clinicId) {
		throw Object.assign(new Error('Patient profile missing clinicId'), {
			statusCode: 500,
		});
	}

	return { patientId: doc.id, clinicId: data.clinicId };
}

function canCancelWith24hRule(
	status: AppointmentStatus,
	scheduledFor: FirebaseFirestore.Timestamp | null,
	nowMs: number
): { ok: true } | { ok: false; reason: string; http: number } {
	if (status === 'completed') {
		return {
			ok: false,
			reason: 'Cannot cancel a completed appointment',
			http: 403,
		};
	}
	if (status === 'cancelled') return { ok: true };
	if (status === 'requested') return { ok: true };

	if (!scheduledFor) {
		return {
			ok: false,
			reason: 'scheduledFor missing on scheduled appointment',
			http: 500,
		};
	}

	const H24 = 24 * 60 * 60 * 1000;
	const diffMs = scheduledFor.toMillis() - nowMs;

	if (diffMs < H24) {
		return {
			ok: false,
			reason: 'Cancellation allowed only if >= 24h before scheduled time',
			http: 403,
		};
	}

	return { ok: true };
}

/**
 * POST /api/appointments/request
 * - patient only
 * - paciente elige nutriUid
 * - idempotente por (patientUid + nutriUid + status=requested)
 */
router.post(
	'/request',
	authMiddleware,
	requireRole('patient'),
	async (req: Request, res: Response) => {
		const ctx = mustAuth(req);

		const parsed = requestBodySchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const { nutriUid } = parsed.data;

		const { firestore } = getFirebaseAdmin();

		// ✅ Idempotencia anti-spam (por nutri seleccionado)
		const existing = await firestore
			.collection('appointments')
			.where('patientUid', '==', ctx.uid)
			.where('nutriUid', '==', nutriUid)
			.where('status', '==', 'requested')
			.limit(1)
			.get();

		if (!existing.empty) {
			return res.status(200).json({
				success: true,
				message: 'Already requested',
				data: {
					id: existing.docs[0].id,
					...(existing.docs[0].data() as AppointmentDoc),
				},
			});
		}

		let patientProfile: { patientId: string; clinicId: string };
		try {
			patientProfile = await getPatientProfileByUid(firestore, ctx.uid);
		} catch (err) {
			const statusCode =
				typeof (err as any)?.statusCode === 'number'
					? (err as any).statusCode
					: 500;
			const message =
				err instanceof Error ? err.message : 'Unknown error resolving patient';
			return res.status(statusCode).json({ success: false, message });
		}
		const { patientId, clinicId } = patientProfile;

		// (Opcional) Hard guard: verificar que el nutri pertenece a la misma clínica.
		// Hoy no tenemos colección nutris, así que lo dejamos para la próxima iteración.

		const now = Timestamp.now();

		const doc: AppointmentDoc = {
			clinicId,
			patientId,
			patientUid: ctx.uid,
			nutriUid,
			status: 'requested',
			requestedAt: now,
			scheduledFor: null,
			cancelledAt: null,
			cancelledByUid: null,
			cancelledByRole: null,
			completedAt: null,
			completedByUid: null,
			completedByRole: null,
			createdAt: now,
			updatedAt: now,
		};

		const ref = await firestore.collection('appointments').add(doc);

		return res.status(201).json({
			success: true,
			message: 'Appointment requested',
			data: { id: ref.id, ...doc },
		});
	}
);

/**
 * POST /api/appointments/:id/schedule
 * - clinic_admin/nutri/patient
 * - clinic scoped para roles de clínica, paciente solo propias citas
 * - solo desde requested
 * - respeta nutriUid del request salvo clinic_admin (puede cambiar)
 */
router.post(
	'/:id/schedule',
	authMiddleware,
	async (req: Request, res: Response) => {
		const ctx = mustAuth(req);
		const role = (ctx.role as Role | null) ?? null;

		if (!role) {
			return res
				.status(403)
				.json({ success: false, message: 'Missing role claim' });
		}

		const allowedRoles: Role[] = ['clinic_admin', 'nutri', 'patient'];
		if (!allowedRoles.includes(role)) {
			return res.status(403).json({
				success: false,
				message: 'Only clinic or patient roles can schedule appointments',
			});
		}

		const parsedParams = scheduleParamsSchema.safeParse(req.params);
		if (!parsedParams.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid params',
				errors: parsedParams.error.flatten(),
			});
		}

		const parsedBody = scheduleBodySchema.safeParse(req.body ?? {});
		if (!parsedBody.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsedBody.error.flatten(),
			});
		}

		const clinicId = ctx.clinicId;
		if (!clinicId && role !== 'patient') {
			return res
				.status(403)
				.json({ success: false, message: 'Missing clinicId claim' });
		}

		// guard: si schedule lo hace un nutri, solo puede schedule para sí mismo
		if (role === 'nutri' && parsedBody.data.nutriUid !== ctx.uid) {
			return res.status(403).json({
				success: false,
				message: 'nutri can only schedule appointments for own uid',
			});
		}

		const scheduledMs = Date.parse(parsedBody.data.scheduledForIso);
		if (!Number.isFinite(scheduledMs)) {
			return res.status(400).json({
				success: false,
				message: 'scheduledForIso must be a valid ISO date string',
			});
		}

		const { firestore } = getFirebaseAdmin();
		const ref = firestore.collection('appointments').doc(parsedParams.data.id);

		const result = await firestore.runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			if (!snap.exists) {
				return {
					http: 404 as const,
					body: { success: false, message: 'Appointment not found' },
				};
			}

			const appt = snap.data() as AppointmentDoc;

			// clinic isolation (paciente no requiere clinicId en claim)
			if (role !== 'patient') {
				if (appt.clinicId !== clinicId) {
					return {
						http: 403 as const,
						body: { success: false, message: 'Forbidden' },
					};
				}
			} else if (appt.patientUid !== ctx.uid) {
				return {
					http: 403 as const,
					body: {
						success: false,
						message: 'Patients can only schedule own appointments',
					},
				};
			}

			if (appt.status === 'cancelled') {
				return {
					http: 409 as const,
					body: {
						success: false,
						message: 'Cannot schedule a cancelled appointment',
					},
				};
			}
			if (appt.status === 'completed') {
				return {
					http: 409 as const,
					body: {
						success: false,
						message: 'Cannot schedule a completed appointment',
					},
				};
			}

			const newScheduled = Timestamp.fromMillis(scheduledMs);

			// idempotente: ya scheduled igual => OK
			if (
				appt.status === 'scheduled' &&
				appt.scheduledFor?.toMillis() === newScheduled.toMillis() &&
				appt.nutriUid === parsedBody.data.nutriUid
			) {
				return {
					http: 200 as const,
					body: {
						success: true,
						message: 'Already scheduled',
						data: { id: snap.id, ...appt },
					},
				};
			}

			if (appt.status !== 'requested') {
				return {
					http: 409 as const,
					body: {
						success: false,
						message: `Cannot schedule from status=${appt.status}`,
					},
				};
			}

			// Regla: si el request ya tiene nutriUid, un nutri NO puede cambiarlo
			if (role === 'nutri') {
				if (appt.nutriUid !== ctx.uid) {
					return {
						http: 403 as const,
						body: {
							success: false,
							message: 'This appointment was requested for another nutri',
						},
					};
				}
			}
			if (
				role === 'patient' &&
				appt.nutriUid &&
				appt.nutriUid !== parsedBody.data.nutriUid
			) {
				return {
					http: 403 as const,
					body: {
						success: false,
						message: 'Patients cannot change the assigned nutri when scheduling',
					},
				};
			}

			// clinic_admin puede reasignar (si querés bloquearlo, lo cambiamos después)
			const now = Timestamp.now();
			const update: Partial<AppointmentDoc> = {
				status: 'scheduled',
				scheduledFor: newScheduled,
				nutriUid: parsedBody.data.nutriUid,
				updatedAt: now,
			};

			tx.update(ref, update);

			return {
				http: 200 as const,
				body: {
					success: true,
					message: 'Scheduled',
					data: { id: snap.id, ...appt, ...update },
				},
			};
		});

		return res.status(result.http).json(result.body);
	}
);

/**
 * GET /api/appointments
 * - patient: own
 * - clinic roles: clinic scoped
 * - platform_admin: all
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
	const ctx = mustAuth(req);
	const role = ctx.role ?? null;

	if (!role) {
		return res
			.status(403)
			.json({ success: false, message: 'Missing role claim' });
	}

	const { firestore } = getFirebaseAdmin();

	if (role === 'patient') {
		const snap = await firestore
			.collection('appointments')
			.where('patientUid', '==', ctx.uid)
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();

		const items = snap.docs.map((d) => ({
			id: d.id,
			...(d.data() as AppointmentDoc),
		}));
		return res.status(200).json({ success: true, data: items });
	}

	if (role === 'platform_admin') {
		const snap = await firestore
			.collection('appointments')
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();

		const items = snap.docs.map((d) => ({
			id: d.id,
			...(d.data() as AppointmentDoc),
		}));
		return res.status(200).json({ success: true, data: items });
	}

	return requireClinicContext(req, res, async () => {
		const clinicId = req.auth?.clinicId;
		if (!clinicId) {
			return res
				.status(403)
				.json({ success: false, message: 'Missing clinicId claim' });
		}

		const snap = await firestore
			.collection('appointments')
			.where('clinicId', '==', clinicId)
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();

		const items = snap.docs.map((d) => ({
			id: d.id,
			...(d.data() as AppointmentDoc),
		}));
		return res.status(200).json({ success: true, data: items });
	});
});

/**
 * POST /api/appointments/:id/cancel
 */
router.post(
	'/:id/cancel',
	authMiddleware,
	async (req: Request, res: Response) => {
		const ctx = mustAuth(req);
		const role = ctx.role ?? null;

		if (!role) {
			return res
				.status(403)
				.json({ success: false, message: 'Missing role claim' });
		}

		const parsedParams = cancelParamsSchema.safeParse(req.params);
		if (!parsedParams.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid params',
				errors: parsedParams.error.flatten(),
			});
		}

		const { id } = parsedParams.data;

		const { firestore } = getFirebaseAdmin();
		const ref = firestore.collection('appointments').doc(id);

		const result = await firestore.runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			if (!snap.exists) {
				return {
					http: 404 as const,
					body: { success: false, message: 'Appointment not found' },
				};
			}

			const appt = snap.data() as AppointmentDoc;

			// AuthZ
			if (role === 'patient') {
				if (appt.patientUid !== ctx.uid) {
					return {
						http: 403 as const,
						body: { success: false, message: 'Forbidden' },
					};
				}
			} else if (role === 'platform_admin') {
				// ok
			} else {
				const clinicId = ctx.clinicId;
				if (!clinicId) {
					return {
						http: 403 as const,
						body: { success: false, message: 'Missing clinicId claim' },
					};
				}
				if (appt.clinicId !== clinicId) {
					return {
						http: 403 as const,
						body: { success: false, message: 'Forbidden' },
					};
				}
			}

			if (appt.status === 'cancelled') {
				return {
					http: 200 as const,
					body: {
						success: true,
						message: 'Already cancelled',
						data: { id, ...appt },
					},
				};
			}

			const rule = canCancelWith24hRule(
				appt.status,
				appt.scheduledFor ?? null,
				Date.now()
			);
			if (!rule.ok) {
				return {
					http: rule.http as 403 | 500,
					body: { success: false, message: rule.reason },
				};
			}

			const now = Timestamp.now();
			const updated: Partial<AppointmentDoc> = {
				status: 'cancelled',
				cancelledAt: now,
				cancelledByUid: ctx.uid,
				cancelledByRole: role as Role,
				updatedAt: now,
			};

			tx.update(ref, updated);

			return {
				http: 200 as const,
				body: {
					success: true,
					message: 'Cancelled',
					data: { id, ...appt, ...updated },
				},
			};
		});

		return res.status(result.http).json(result.body);
	}
);

/**
 * POST /api/appointments/:id/complete
 * - clinic_admin/nutri: solo dentro de su clínica
 * - nutri: únicamente si es el mismo asignado
 * - platform_admin: puede completar cualquier cita
 */
router.post(
	'/:id/complete',
	authMiddleware,
	requireRole('clinic_admin', 'nutri', 'platform_admin'),
	async (req: Request, res: Response) => {
		const ctx = mustAuth(req);
		const role = ctx.role!;

		const parsedParams = scheduleParamsSchema.safeParse(req.params);
		if (!parsedParams.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid params',
				errors: parsedParams.error.flatten(),
			});
		}

		const { firestore } = getFirebaseAdmin();
		const ref = firestore.collection('appointments').doc(parsedParams.data.id);

		const result = await firestore.runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			if (!snap.exists) {
				return {
					http: 404 as const,
					body: { success: false, message: 'Appointment not found' },
				};
			}

			const appt = snap.data() as AppointmentDoc;

			// Aislamiento por clínica (excepto platform_admin)
			if (role !== 'platform_admin') {
				const clinicId = ctx.clinicId;
				if (!clinicId) {
					return {
						http: 403 as const,
						body: { success: false, message: 'Missing clinicId claim' },
					};
				}
				if (appt.clinicId !== clinicId) {
					return {
						http: 403 as const,
						body: { success: false, message: 'Forbidden' },
					};
				}
			}

			if (appt.status === 'cancelled') {
				return {
					http: 409 as const,
					body: { success: false, message: 'Cannot complete a cancelled appointment' },
				};
			}

			if (appt.status === 'completed') {
				return {
					http: 200 as const,
					body: {
						success: true,
						message: 'Already completed',
						data: { id: snap.id, ...appt },
					},
				};
			}

			if (appt.status !== 'scheduled') {
				return {
					http: 409 as const,
					body: { success: false, message: 'Only scheduled appointments can be completed' },
				};
			}

			// Nutri solo completa si es el asignado
			if (role === 'nutri' && appt.nutriUid !== ctx.uid) {
				return {
					http: 403 as const,
					body: { success: false, message: 'nutri can only complete own appointments' },
				};
			}

			const now = Timestamp.now();
			const updated: Partial<AppointmentDoc> = {
				status: 'completed',
				completedAt: now,
				completedByUid: ctx.uid,
				completedByRole: role as Role,
				updatedAt: now,
			};

			tx.update(ref, updated);

			return {
				http: 200 as const,
				body: {
					success: true,
					message: 'Completed',
					data: { id: snap.id, ...appt, ...updated },
				},
			};
		});

		return res.status(result.http).json(result.body);
	}
);

export const appointmentsRouter = router;
