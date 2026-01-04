import { Router, type Request, type Response } from 'express';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { requirePatientLink } from '../middlewares/requirePatientLink.js';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { AppointmentDoc, AppointmentStatus } from '../types/appointments.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';
import { logEvent } from '../observability/eventLogger.js';

const router = Router();

const scheduleBodySchema = z.object({
	scheduledFor: z.string().min(10),
	nutriUid: z.string().min(1),
});

const cancelBodySchema = z.object({}).optional();

function timestampToIso(ts: Timestamp | null): string | null {
	return ts ? new Date(ts.toMillis()).toISOString() : null;
}

async function getMembership(
	db: Firestore,
	clinicId: string,
	uid: string
): Promise<ClinicMembershipDoc | null> {
	const snap = await db
		.collection('clinic_memberships')
		.where('clinicId', '==', clinicId)
		.where('uid', '==', uid)
		.where('isActive', '==', true)
		.limit(1)
		.get();
	if (snap.empty) return null;
	const doc = snap.docs[0];
	if (!doc) return null;
	return doc.data() as ClinicMembershipDoc;
}

async function getPatientLink(
	db: Firestore,
	clinicId: string,
	uid: string
	): Promise<{ patientId: string } | null> {
	const snap = await db
		.collection('patients')
		.where('clinicId', '==', clinicId)
		.where('linkedUid', '==', uid)
		.limit(1)
		.get();
	if (snap.empty) return null;
	const doc = snap.docs[0];
	if (!doc) return null;
	return { patientId: doc.id };
}

function canCancelWith24hRule(
	status: AppointmentStatus,
	scheduledFor: Timestamp | null,
	nowMs: number
): { ok: true } | { ok: false; reason: string; http: number } {
	if (status === 'completed') {
		return { ok: false, reason: 'Cannot cancel a completed appointment', http: 403 };
	}
	if (status === 'cancelled') return { ok: true };
	if (status === 'requested') return { ok: true };

	if (!scheduledFor) {
		return { ok: false, reason: 'scheduledFor missing on scheduled appointment', http: 500 };
	}

	const H24 = 24 * 60 * 60 * 1000;
	const diffMs = scheduledFor.toMillis() - nowMs;

	if (diffMs < H24) {
		return { ok: false, reason: 'Cancellation allowed only if >= 24h before scheduled time', http: 403 };
	}

	return { ok: true };
}

router.post('/request', authMiddleware, requirePatientLink, async (req: Request, res: Response) => {
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
			return res.status(500).json({ success: false, message: 'Failed to resolve requested appointment' });
		}
		return res.status(200).json({
			success: true,
			message: 'Already requested',
			data: { id: doc.id, ...(doc.data() as AppointmentDoc) },
		});
	}

	const now = Timestamp.now();
	const doc: AppointmentDoc = {
		clinicId: patientCtx.clinicId,
		patientId: patientCtx.patientId,
		patientUid: auth.uid,
		nutriUid: null,
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
});

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
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();
		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as AppointmentDoc) }));
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

		let query = db
			.collection('appointments')
			.where('clinicId', '==', clinicId)
			.orderBy('createdAt', 'desc');
		if (role === 'nutri') {
			query = query.where('nutriUid', '==', auth.uid);
		}

		const snap = await query.limit(50).get();
		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as AppointmentDoc) }));
		return res.status(200).json({ success: true, data: items });
	}

	const patient = await getPatientLink(db, clinicId, auth.uid);
	if (patient) {
		const snap = await db
			.collection('appointments')
			.where('clinicId', '==', clinicIdHeader)
			.where('patientUid', '==', auth.uid)
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();
		const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as AppointmentDoc) }));
		return res.status(200).json({ success: true, data: items });
	}

	return denyAuthz(
		req,
		res,
		`User ${auth.uid} has no membership or patient link in clinic ${clinicIdHeader}`
	);
});

router.post(
	'/:id/schedule',
	authMiddleware,
		requireClinicContext,
		requireRole('clinic_admin', 'staff', 'nutri'),
		async (req: Request, res: Response) => {
			const auth = req.auth!;
			const clinicId = auth.clinicId!;
			const apptId = req.params.id;
			if (!apptId) {
				return res.status(400).json({ success: false, message: 'Missing appointment id' });
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
				return { http: 404 as const, body: { success: false, message: 'Appointment not found' } };
			}

			const appt = snap.data() as AppointmentDoc;
			if (appt.clinicId !== clinicId) {
				return denyAuthz(req, res, 'Cross-clinic schedule') as any;
			}

			if (appt.status === 'cancelled') {
				return { http: 409 as const, body: { success: false, message: 'Cannot schedule a cancelled appointment' } };
			}

			if (appt.status === 'completed') {
				return { http: 409 as const, body: { success: false, message: 'Cannot schedule a completed appointment' } };
			}

			if (auth.role === 'nutri' && appt.nutriUid && appt.nutriUid !== auth.uid) {
				return denyAuthz(req, res, 'Nutri cannot take appointment for another nutri') as any;
			}

			if (auth.role === 'nutri' && parsedBody.data.nutriUid !== auth.uid) {
				return denyAuthz(req, res, 'Nutri cannot assign appointment to another nutri') as any;
			}

			const newScheduled = Timestamp.fromMillis(scheduledMs);
			const update: Partial<AppointmentDoc> = {
				status: 'scheduled',
				scheduledFor: newScheduled,
				nutriUid: parsedBody.data.nutriUid,
				updatedAt: Timestamp.now(),
			};

			tx.update(ref, update);

			return {
				http: 200 as const,
				body: { success: true, message: 'Scheduled', data: { id: ref.id, ...appt, ...update } },
			};
		});

		return res.status(result.http).json(result.body);
	}
);

router.post('/:id/cancel', authMiddleware, async (req: Request, res: Response) => {
	const auth = req.auth!;
	const clinicIdHeader = req.header('x-clinic-id');
	const parsedBody = cancelBodySchema.safeParse(req.body ?? {});
	const apptId = req.params.id;
	if (!apptId) {
		return res.status(400).json({ success: false, message: 'Missing appointment id' });
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
		return res.status(404).json({ success: false, message: 'Appointment not found' });
	}
	const appt = snap.data() as AppointmentDoc;

	if (auth.isPlatformAdmin) {
		// allowed
	} else if (!clinicIdHeader) {
		return res.status(400).json({ success: false, message: 'Missing X-Clinic-Id header' });
	} else {
		const clinicId = clinicIdHeader as string;
		const membership = await getMembership(db, clinicId, auth.uid);
		const patient = await getPatientLink(db, clinicId, auth.uid);

		if (membership) {
			req.auth = { ...auth, clinicId, role: membership.role };
			if (appt.clinicId !== clinicId) {
				return denyAuthz(req, res, 'Cross-clinic cancel');
			}
			if (membership.role === 'nutri' && appt.nutriUid !== auth.uid) {
				return denyAuthz(req, res, 'Nutri cannot cancel appointments of other nutris');
			}
		} else if (patient) {
			if (appt.clinicId !== clinicId || appt.patientUid !== auth.uid) {
				return denyAuthz(req, res, 'Patient can only cancel own appointments');
			}
		} else {
			return denyAuthz(req, res, 'No membership or patient link to cancel');
		}
	}

	if (appt.status === 'cancelled') {
		return res.status(200).json({ success: true, message: 'Already cancelled', data: { id: snap.id, ...appt } });
	}

	const rule = canCancelWith24hRule(appt.status, appt.scheduledFor, Date.now());
	if (!rule.ok) {
		return res.status(rule.http).json({ success: false, message: rule.reason });
	}

	const now = Timestamp.now();
	const updated: Partial<AppointmentDoc> = {
		status: 'cancelled',
		cancelledAt: now,
		cancelledByUid: auth.uid,
		cancelledByRole: auth.role ?? (auth.isPlatformAdmin ? 'platform_admin' : null),
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
});

router.post(
	'/:id/complete',
	authMiddleware,
		requireClinicContext,
		requireRole('clinic_admin', 'staff', 'nutri'),
		async (req: Request, res: Response) => {
			const auth = req.auth!;
			const clinicId = auth.clinicId!;
			const apptId = req.params.id;
			if (!apptId) {
				return res.status(400).json({ success: false, message: 'Missing appointment id' });
			}
			const db = getFirestoreDb();
			const ref = db.collection('appointments').doc(apptId);

		const result = await db.runTransaction(async (tx) => {
			const snap = await tx.get(ref);
			if (!snap.exists) {
				return { http: 404 as const, body: { success: false, message: 'Appointment not found' } };
			}

			const appt = snap.data() as AppointmentDoc;
			if (appt.clinicId !== clinicId) {
				return denyAuthz(req, res, 'Cross-clinic complete') as any;
			}

			if (appt.status === 'cancelled') {
				return { http: 409 as const, body: { success: false, message: 'Cannot complete a cancelled appointment' } };
			}

			if (appt.status === 'completed') {
				return {
					http: 200 as const,
					body: { success: true, message: 'Already completed', data: { id: snap.id, ...appt } },
				};
			}

			if (appt.status !== 'scheduled') {
				return { http: 409 as const, body: { success: false, message: 'Only scheduled appointments can be completed' } };
			}

			if (auth.role === 'nutri' && appt.nutriUid !== auth.uid) {
				return denyAuthz(req, res, 'Nutri cannot complete appointments of other nutris') as any;
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
			return { http: 200 as const, body: { success: true, message: 'Completed', data: { id: snap.id, ...appt, ...updated } } };
		});

		return res.status(result.http).json(result.body);
	}
);

// Mantener endpoint de slots para compatibilidad mínima (mock simple)
router.get('/slots', authMiddleware, requireClinicContext, async (_req: Request, res: Response) => {
	return res.status(200).json({ success: true, data: { free: [], busy: [], slots: [] } });
});

export const appointmentsRouter = router;
