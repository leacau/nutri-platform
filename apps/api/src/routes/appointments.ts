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

	status: AppointmentStatus;

	requestedAt: FirebaseFirestore.Timestamp;
	scheduledFor: FirebaseFirestore.Timestamp | null;

	cancelledAt: FirebaseFirestore.Timestamp | null;
	cancelledByUid: string | null;
	cancelledByRole: Role | null;

	createdAt: FirebaseFirestore.Timestamp;
	updatedAt: FirebaseFirestore.Timestamp;
};

const router = Router();

const requestBodySchema = z.object({}).strict();

const cancelParamsSchema = z.object({
	id: z.string().min(1),
});

function mustAuth(req: Request) {
	if (!req.auth) {
		// middleware order bug = infra bug, not user error
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

	if (status === 'cancelled') {
		return { ok: true };
	}

	if (status === 'requested') {
		return { ok: true };
	}

	// scheduled
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
 * - creates requested appointment (no scheduledFor)
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

		const { firestore } = getFirebaseAdmin();

		const { patientId, clinicId } = await getPatientProfileByUid(
			firestore,
			ctx.uid
		);

		const now = Timestamp.now();

		const doc: AppointmentDoc = {
			clinicId,
			patientId,
			patientUid: ctx.uid,
			status: 'requested',
			requestedAt: now,
			scheduledFor: null,
			cancelledAt: null,
			cancelledByUid: null,
			cancelledByRole: null,
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
 * GET /api/appointments
 * - patient: only own (patientUid == uid)
 * - clinic roles: clinic-scoped (clinicId claim required)
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

	// clinic roles: enforce claim via middleware
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
 * - patient: only own
 * - clinic roles: only same clinic (clinicId claim required)
 * - platform_admin: any
 *
 * Idempotent: if already cancelled => 200 OK
 * 24h rule: only enforced for scheduled (needs scheduledFor)
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

			// AuthZ (fail closed)
			if (role === 'patient') {
				if (appt.patientUid !== ctx.uid) {
					return {
						http: 403 as const,
						body: { success: false, message: 'Forbidden' },
					};
				}
			} else if (role === 'platform_admin') {
				// allowed
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

			// Idempotent cancel
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

export const appointmentsRouter = router;
