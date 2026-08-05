import { Router, type Request, type Response } from 'express';

import { Timestamp, type Firestore } from 'firebase-admin/firestore';

import { z } from 'zod';

import { authMiddleware } from '../middlewares/authMiddleware.js';

import { requireClinicContext } from '../middlewares/requireClinicContext.js';

import { requireRole } from '../middlewares/requireRole.js';

import { requirePatientLink } from '../middlewares/requirePatientLink.js';

import { denyAuthz } from '../security/authz.js';

import { getFirestoreDb } from '../firebase/firestore.js';

import type {
	AppointmentDoc,
	AppointmentStatus,
} from '../types/appointments.js';

import type { ClinicDoc, ClinicMembershipDoc } from '../types/clinics.js';

import { logEvent } from '../observability/eventLogger.js';
import { pickHighestClinicRole } from '../security/clinicRolePriority.js';

const router = Router();

const createDirectBodySchema = z.object({
	patientId: z.string().min(1),

	professionalUid: z.string().min(1),

	scheduledFor: z.string().min(10), // Fecha en formato ISO
});

const scheduleBodySchema = z.object({
	scheduledFor: z.string().min(10),

	professionalUid: z.string().min(1),
});

const requestBodySchema = z

	.object({
		professionalUid: z.string().min(1).optional(),
	})

	.optional();

const cancelBodySchema = z.object({}).optional();

// NUEVO: Esquema para actualizar turnos
const updateBodySchema = z.object({
	scheduledFor: z.string().min(10).optional(),

	professionalUid: z.string().min(1).optional(),
});

function timestampToIso(ts: Timestamp | null): string | null {
	return ts ? new Date(ts.toMillis()).toISOString() : null;
}

function timestampMillis(value: any): number {
	if (!value) return 0;
	if (typeof value.toMillis === 'function') return value.toMillis();
	if (typeof value._seconds === 'number') return value._seconds * 1000;
	if (typeof value.seconds === 'number') return value.seconds * 1000;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function sortAppointmentsByCreatedAtDesc(
	items: Array<{ id: string } & AppointmentDoc>,
) {
	return items.sort(
		(a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt),
	);
}

async function getMembership(
	db: Firestore,

	clinicId: string,

	uid: string,
): Promise<ClinicMembershipDoc | null> {
	const snap = await db

		.collection('clinic_memberships')

		.where('clinicId', '==', clinicId)

		.where('uid', '==', uid)

		.where('isActive', '==', true)

		.get();

	if (snap.empty) return null;

	const memberships = snap.docs.map((doc) => doc.data() as ClinicMembershipDoc);
	const role = pickHighestClinicRole(memberships.map((membership) => membership.role));
	const selected =
		memberships.find((membership) => membership.role === role) ?? memberships[0];

	if (!selected || !role) return null;

	return { ...selected, role };
}

async function getPatientLink(
	db: Firestore,

	clinicId: string,

	uid: string,
): Promise<{ patientId: string } | null> {
	const snap = await db

		.collection('patients')

		.where('clinicId', '==', clinicId)

		.where('linkedUid', '==', uid)

		.limit(1)

		.get();

	if (!snap.empty) {
		const doc = snap.docs[0];
		if (doc) return { patientId: doc.id };
	}

	const appointmentSnap = await db
		.collection('appointments')
		.where('clinicId', '==', clinicId)
		.where('patientUid', '==', uid)
		.limit(1)
		.get();

	if (appointmentSnap.empty) return null;

	const appointmentDoc = appointmentSnap.docs[0];
	const patientId = appointmentDoc?.data()?.patientId;
	if (!patientId) return null;

	const patientDoc = await db.collection('patients').doc(patientId).get();
	if (!patientDoc.exists || patientDoc.data()?.clinicId !== clinicId) return null;

	return { patientId: patientDoc.id };
}

// FIX: Recibe el rol para relajar la regla de 24hs si es personal de la clínica
function canCancelWith24hRule(
	status: AppointmentStatus,

	scheduledFor: Timestamp | null,

	nowMs: number,

	role?: string | null,

	minHoursBefore = 24,
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

	if (
		role &&
		['clinic_admin', 'staff', 'professional', 'platform_admin'].includes(role)
	) {
		return { ok: true };
	}

	if (!scheduledFor) {
		return {
			ok: false,

			reason: 'scheduledFor missing on scheduled appointment',

			http: 500,
		};
	}

	const minimumMs = minHoursBefore * 60 * 60 * 1000;

	const diffMs = scheduledFor.toMillis() - nowMs;

	if (diffMs < minimumMs) {
		return {
			ok: false,

			reason: `Cancellation allowed only if >= ${minHoursBefore}h before scheduled time`,

			http: 403,
		};
	}

	return { ok: true };
}

// NUEVO ENDPOINT: Creación directa de turnos para Profesionales y Staff

router.post(
	'/',

	authMiddleware,

	requireClinicContext,

	requireRole('clinic_admin', 'staff', 'professional', 'platform_admin'),

	async (req: Request, res: Response) => {
		const auth = req.auth!;

		const clinicId = auth.clinicId!;

		const parsed = createDirectBodySchema.safeParse(req.body);

		if (!parsed.success) {
			return res

				.status(400)

				.json({
					success: false,

					message: 'Invalid body',

					errors: parsed.error.flatten(),
				});
		}

		// Seguridad: Si es profesional, solo puede agendarse a sí mismo

		if (
			auth.role === 'professional' &&
			parsed.data.professionalUid !== auth.uid
		) {
			return denyAuthz(
				req,

				res,

				'Professional can only schedule for themselves',
			);
		}

		const db = getFirestoreDb();

		// Verificar que el paciente existe en la clínica

		const patientSnap = await db

			.collection('patients')

			.doc(parsed.data.patientId)

			.get();

		if (!patientSnap.exists || patientSnap.data()?.clinicId !== clinicId) {
			return res

				.status(404)

				.json({ success: false, message: 'Patient not found in this clinic' });
		}

		const scheduledMs = Date.parse(parsed.data.scheduledFor);

		if (!Number.isFinite(scheduledMs)) {
			return res

				.status(400)

				.json({ success: false, message: 'Invalid scheduledFor date' });
		}

		const now = Timestamp.now();

		const doc: AppointmentDoc = {
			clinicId,

			patientId: parsed.data.patientId,

			patientUid: patientSnap.data()?.linkedUid || null,

			professionalUid: parsed.data.professionalUid,

			status: 'scheduled', // Ya nace programado

			requestedAt: now,

			scheduledFor: Timestamp.fromMillis(scheduledMs),

			cancelledAt: null,

			cancelledByUid: null,

			cancelledByRole: null,

			completedAt: null,

			completedByUid: null,

			completedByRole: null,

			createdAt: now,

			updatedAt: now,
		};

		const ref = await db.collection('appointments').add(doc);

		logEvent('appointment_created_directly', {
			req,

			clinicId,

			data: { appointmentId: ref.id, patientId: parsed.data.patientId },
		});

		return res.status(201).json({
			success: true,

			message: 'Appointment scheduled',

			data: { id: ref.id, ...doc },
		});
	},
);

router.post(
	'/request',

	authMiddleware,

	requirePatientLink,

	async (req: Request, res: Response) => {
		const auth = req.auth!;

		const patientCtx = req.patientContext!;

		const db = getFirestoreDb();

		const existing = await db

			.collection('appointments')

			.where('clinicId', '==', patientCtx.clinicId)

			.where('patientUid', '==', auth.uid)

			.where('status', '==', 'requested')

			.limit(1)

			.get();

		if (!existing.empty) {
			const doc = existing.docs[0];

			if (!doc) {
				return res

					.status(500)

					.json({
						success: false,

						message: 'Failed to resolve requested appointment',
					});
			}

			return res.status(200).json({
				success: true,

				message: 'Already requested',

				data: { id: doc.id, ...(doc.data() as AppointmentDoc) },
			});
		}

		const parsedRequest = requestBodySchema.safeParse(req.body ?? {});

		if (!parsedRequest.success) {
			return res.status(400).json({
				success: false,

				message: 'Invalid body',

				errors: parsedRequest.error.flatten(),
			});
		}

		const professionalUid = parsedRequest.data?.professionalUid ?? null;

		if (professionalUid) {
			const membership = await db

				.collection('clinic_memberships')

				.where('clinicId', '==', patientCtx.clinicId)

				.where('uid', '==', professionalUid)

				.where('role', '==', 'professional')

				.where('isActive', '==', true)

				.limit(1)

				.get();

			if (membership.empty) {
				return res.status(400).json({
					success: false,

					message:
						'professionalUid is not an active professional in this clinic',
				});
			}
		}

		const now = Timestamp.now();

		const doc: AppointmentDoc = {
			clinicId: patientCtx.clinicId,

			patientId: patientCtx.patientId,

			patientUid: auth.uid,

			professionalUid,

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

		const ref = await db.collection('appointments').add(doc);

		logEvent('appointment_requested', {
			req,

			clinicId: patientCtx.clinicId,

			data: { appointmentId: ref.id, patientId: patientCtx.patientId },
		});

		return res.status(201).json({
			success: true,

			message: 'Appointment requested',

			data: { id: ref.id, ...doc },
		});
	},
);

router.get('/', authMiddleware, async (req: Request, res: Response) => {
	const auth = req.auth!;

	const clinicIdHeader = req.header('x-clinic-id');

	const db = getFirestoreDb();

	if (auth.isPlatformAdmin) {
		const clinicId =
			clinicIdHeader ?? (req.query.clinicId as string | undefined) ?? null;

		if (!clinicId) {
			return res.status(400).json({
				success: false,

				message: 'clinicId is required for platform admin listing',
			});
		}

		const snap = await db
			.collection('appointments')
			.where('clinicId', '==', clinicId)
			.get();

		const items = sortAppointmentsByCreatedAtDesc(snap.docs.map((d) => ({
			id: d.id,

			...(d.data() as AppointmentDoc),
		}))).slice(0, 50);

		return res.status(200).json({ success: true, data: items });
	}

	if (!clinicIdHeader) {
		return res.status(400).json({
			success: false,

			message: 'X-Clinic-Id header is required',
		});
	}

	const clinicId = clinicIdHeader as string;

	const membership = await getMembership(db, clinicId, auth.uid);

	if (membership) {
		const role = membership.role;

		req.auth = { ...auth, clinicId, role };

		const snap = await db
			.collection('appointments')
			.where('clinicId', '==', clinicId)
			.get();

		let items = snap.docs.map((d) => ({
			id: d.id,

			...(d.data() as AppointmentDoc),
		}));

		if (role === 'professional') {
			items = items.filter((appointment) => appointment.professionalUid === auth.uid);
		}

		items = sortAppointmentsByCreatedAtDesc(items).slice(0, 50);

		return res.status(200).json({ success: true, data: items });
	}

	const patient = await getPatientLink(db, clinicId, auth.uid);

	if (patient) {
		const snap = await db
			.collection('appointments')
			.where('clinicId', '==', clinicId)
			.get();

		const items = sortAppointmentsByCreatedAtDesc(snap.docs.map((d) => ({
			id: d.id,

			...(d.data() as AppointmentDoc),
		})).filter((appointment) => appointment.patientUid === auth.uid)).slice(0, 50);

		return res.status(200).json({ success: true, data: items });
	}

	return denyAuthz(
		req,

		res,

		`User ${auth.uid} has no membership or patient link in clinic ${clinicIdHeader}`,
	);
});

router.post(
	'/:id/schedule',

	authMiddleware,

	requireClinicContext,

	requireRole('clinic_admin', 'staff', 'professional'),

	async (req: Request, res: Response) => {
		const auth = req.auth!;

		const clinicId = auth.clinicId!;

		const apptId = req.params.id as string; // FIX TS STRICTNESS

		if (!apptId) {
			return res

				.status(400)

				.json({ success: false, message: 'Missing appointment id' });
		}

		const parsedBody = scheduleBodySchema.safeParse(req.body ?? {});

		if (!parsedBody.success) {
			return res.status(400).json({
				success: false,

				message: 'Invalid body',

				errors: parsedBody.error.flatten(),
			});
		}

		const scheduledMs = Date.parse(parsedBody.data.scheduledFor);

		if (!Number.isFinite(scheduledMs)) {
			return res.status(400).json({
				success: false,

				message: 'scheduledFor must be a valid ISO date string',
			});
		}

		const db = getFirestoreDb();

		const ref = db.collection('appointments').doc(apptId);

		const result = await db.runTransaction(async (tx) => {
			const snap = await tx.get(ref);

			if (!snap.exists) {
				return {
					http: 404 as const,

					body: { success: false, message: 'Appointment not found' },
				};
			}

			const appt = snap.data() as AppointmentDoc;

			if (appt.clinicId !== clinicId) {
				return denyAuthz(req, res, 'Cross-clinic schedule') as any;
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

			if (
				auth.role === 'professional' &&
				appt.professionalUid &&
				appt.professionalUid !== auth.uid
			) {
				return denyAuthz(
					req,

					res,

					'Professional cannot take appointment for another professional',
				) as any;
			}

			if (
				auth.role === 'professional' &&
				parsedBody.data.professionalUid !== auth.uid
			) {
				return denyAuthz(
					req,

					res,

					'Professional cannot assign appointment to another professional',
				) as any;
			}

			const newScheduled = Timestamp.fromMillis(scheduledMs);

			const update: Partial<AppointmentDoc> = {
				status: 'scheduled',

				scheduledFor: newScheduled,

				professionalUid: parsedBody.data.professionalUid,

				updatedAt: Timestamp.now(),
			};

			tx.update(ref, update);

			return {
				http: 200 as const,

				body: {
					success: true,

					message: 'Scheduled',

					data: { id: ref.id, ...appt, ...update },
				},
			};
		});

		return res.status(result.http).json(result.body);
	},
);

// NUEVO ENDPOINT: Edición de un turno
router.patch(
	'/:id',

	authMiddleware,

	requireClinicContext,

	requireRole('clinic_admin', 'staff', 'professional'),

	async (req: Request, res: Response) => {
		const auth = req.auth!;

		const clinicId = auth.clinicId!;

		const apptId = req.params.id as string; // FIX TS STRICTNESS

		const parsedBody = updateBodySchema.safeParse(req.body);

		if (!parsedBody.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsedBody.error.flatten(),
			});
		}

		const db = getFirestoreDb();

		const ref = db.collection('appointments').doc(apptId);

		const result = await db.runTransaction(async (tx) => {
			const snap = await tx.get(ref);

			if (!snap.exists)
				return {
					http: 404 as const,
					body: { success: false, message: 'Appointment not found' },
				};

			const appt = snap.data() as AppointmentDoc;

			if (appt.clinicId !== clinicId)
				return denyAuthz(req, res, 'Cross-clinic update') as any;

			if (appt.status === 'cancelled' || appt.status === 'completed') {
				return {
					http: 409 as const,
					body: {
						success: false,
						message: 'Cannot edit cancelled or completed appointment',
					},
				};
			}

			if (auth.role === 'professional') {
				if (appt.professionalUid && appt.professionalUid !== auth.uid) {
					return denyAuthz(
						req,
						res,
						'Professional cannot edit another professional appointment',
					) as any;
				}

				if (
					parsedBody.data.professionalUid &&
					parsedBody.data.professionalUid !== auth.uid
				) {
					return denyAuthz(
						req,
						res,
						'Professional cannot reassign appointment to another professional',
					) as any;
				}
			}

			const update: Partial<AppointmentDoc> = { updatedAt: Timestamp.now() };

			if (parsedBody.data.scheduledFor) {
				const scheduledMs = Date.parse(parsedBody.data.scheduledFor);

				if (Number.isFinite(scheduledMs)) {
					update.scheduledFor = Timestamp.fromMillis(scheduledMs);
				}
			}

			if (parsedBody.data.professionalUid !== undefined) {
				update.professionalUid = parsedBody.data.professionalUid;
			}

			tx.update(ref, update);

			return {
				http: 200 as const,

				body: {
					success: true,
					message: 'Updated',
					data: { id: ref.id, ...appt, ...update },
				},
			};
		});

		return res.status(result.http).json(result.body);
	},
);

router.post(
	'/:id/cancel',

	authMiddleware,

	async (req: Request, res: Response) => {
		const auth = req.auth!;

		const clinicIdHeader = req.header('x-clinic-id');

		const parsedBody = cancelBodySchema.safeParse(req.body ?? {});

		const apptId = req.params.id as string; // FIX TS STRICTNESS

		if (!apptId) {
			return res

				.status(400)

				.json({ success: false, message: 'Missing appointment id' });
		}

		if (!parsedBody.success) {
			return res.status(400).json({
				success: false,

				message: 'Invalid body',

				errors: parsedBody.error.flatten(),
			});
		}

		const db = getFirestoreDb();

		const ref = db.collection('appointments').doc(apptId);

		const snap = await ref.get();

		if (!snap.exists) {
			return res

				.status(404)

				.json({ success: false, message: 'Appointment not found' });
		}

		const appt = snap.data() as AppointmentDoc;

		let effectiveRole =
			auth.role ?? (auth.isPlatformAdmin ? 'platform_admin' : null);
		let patientMinHoursBefore = 24;

		if (auth.isPlatformAdmin) {
			// allowed
		} else if (!clinicIdHeader) {
			return res

				.status(400)

				.json({ success: false, message: 'Missing X-Clinic-Id header' });
		} else {
			const clinicId = clinicIdHeader as string;

			const membership = await getMembership(db, clinicId, auth.uid);

			const patient = await getPatientLink(db, clinicId, auth.uid);

			if (membership) {
				effectiveRole = membership.role;

				req.auth = { ...auth, clinicId, role: membership.role };

				if (appt.clinicId !== clinicId) {
					return denyAuthz(req, res, 'Cross-clinic cancel');
				}

				if (
					membership.role === 'professional' &&
					appt.professionalUid !== auth.uid
				) {
					return denyAuthz(
						req,

						res,

						'Professional cannot cancel appointments of other professionals',
					);
				}
			} else if (patient) {
				effectiveRole = 'patient';

				if (appt.clinicId !== clinicId || appt.patientUid !== auth.uid) {
					return denyAuthz(
						req,

						res,

						'Patient can only cancel own appointments',
					);
				}

				const clinicSnap = await db.collection('clinics').doc(clinicId).get();
				const clinic = clinicSnap.data() as ClinicDoc | undefined;
				const selfService = clinic?.patientAppointmentSelfService ?? {};
				if (selfService.canCancel === false) {
					return denyAuthz(
						req,
						res,
						'Clinic does not allow patients to cancel appointments',
					);
				}
				patientMinHoursBefore = selfService.minHoursBefore ?? 24;
			} else {
				return denyAuthz(req, res, 'No membership or patient link to cancel');
			}
		}

		if (appt.status === 'cancelled') {
			return res

				.status(200)

				.json({
					success: true,

					message: 'Already cancelled',

					data: { id: snap.id, ...appt },
				});
		}

		const rule = canCancelWith24hRule(
			appt.status,

			appt.scheduledFor,

			Date.now(),

			effectiveRole,

			patientMinHoursBefore,
		);

		if (!rule.ok) {
			return res

				.status(rule.http)

				.json({ success: false, message: rule.reason });
		}

		const now = Timestamp.now();

		const updated: Partial<AppointmentDoc> = {
			status: 'cancelled',

			cancelledAt: now,

			cancelledByUid: auth.uid,

			cancelledByRole: effectiveRole,

			updatedAt: now,
		};

		await ref.update(updated);

		logEvent('appointment_cancelled', {
			req,

			clinicId: appt.clinicId,

			data: {
				appointmentId: snap.id,

				cancelledByUid: auth.uid,

				cancelledByRole: updated.cancelledByRole,
			},
		});

		return res.status(200).json({
			success: true,

			message: 'Cancelled',

			data: { id: snap.id, ...appt, ...updated },
		});
	},
);

router.post(
	'/:id/arrive',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const apptId = req.params.id as string;

		if (!apptId)
			return res
				.status(400)
				.json({ success: false, message: 'Missing appointment id' });

		const db = getFirestoreDb();
		const ref = db.collection('appointments').doc(apptId);

		const result = await db.runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			if (!snap.exists)
				return {
					http: 404 as const,
					body: { success: false, message: 'Appointment not found' },
				};

			const appt = snap.data() as AppointmentDoc;

			if (appt.clinicId !== clinicId)
				return denyAuthz(req, res, 'Cross-clinic arrive') as any;
			if (appt.status === 'cancelled' || appt.status === 'completed') {
				return {
					http: 409 as const,
					body: {
						success: false,
						message: 'Cannot arrive a cancelled or completed appointment',
					},
				};
			}
			if (appt.status === 'arrived') {
				return {
					http: 200 as const,
					body: {
						success: true,
						message: 'Already arrived',
						data: { id: snap.id, ...appt },
					},
				};
			}

			const now = Timestamp.now();
			const updated: Partial<AppointmentDoc> = {
				status: 'arrived',
				arrivedAt: now,
				updatedAt: now,
			};

			tx.update(ref, updated);

			return {
				http: 200 as const,
				body: {
					success: true,
					message: 'Patient in waiting room',
					data: { id: snap.id, ...appt, ...updated },
				},
			};
		});

		return res.status(result.http).json(result.body);
	},
);

router.post(
	'/:id/complete',

	authMiddleware,

	requireClinicContext,

	requireRole('clinic_admin', 'staff', 'professional'),

	async (req: Request, res: Response) => {
		const auth = req.auth!;

		const clinicId = auth.clinicId!;

		const apptId = req.params.id as string; // FIX TS STRICTNESS

		if (!apptId) {
			return res

				.status(400)

				.json({ success: false, message: 'Missing appointment id' });
		}

		const db = getFirestoreDb();

		const ref = db.collection('appointments').doc(apptId);

		const result = await db.runTransaction(async (tx) => {
			const snap = await tx.get(ref);

			if (!snap.exists) {
				return {
					http: 404 as const,

					body: { success: false, message: 'Appointment not found' },
				};
			}

			const appt = snap.data() as AppointmentDoc;

			if (appt.clinicId !== clinicId) {
				return denyAuthz(req, res, 'Cross-clinic complete') as any;
			}

			if (appt.status === 'cancelled') {
				return {
					http: 409 as const,

					body: {
						success: false,

						message: 'Cannot complete a cancelled appointment',
					},
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

			if (appt.status !== 'scheduled' && appt.status !== 'arrived') {
				return {
					http: 409 as const,
					body: {
						success: false,
						message: 'Only scheduled or arrived appointments can be completed',
					},
				};
			}

			if (auth.role === 'professional' && appt.professionalUid !== auth.uid) {
				return denyAuthz(
					req,

					res,

					'Professional cannot complete appointments of other professionals',
				) as any;
			}

			const now = Timestamp.now();

			const updated: Partial<AppointmentDoc> = {
				status: 'completed',

				completedAt: now,

				completedByUid: auth.uid,

				completedByRole: auth.role,

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
	},
);

// Mantener endpoint de slots para compatibilidad mínima (mock simple)

router.get(
	'/slots',

	authMiddleware,

	requireClinicContext,

	async (_req: Request, res: Response) => {
		return res

			.status(200)

			.json({ success: true, data: { free: [], busy: [], slots: [] } });
	},
);

export const appointmentsRouter = router;
