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
import { isIndividualPracticeOwner } from '../security/individualPractice.js';
import { resolvePatientPortalPatientForClinic } from '../security/patientPortalLink.js';

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
		scheduledFor: z.string().min(10).optional(),
	})

	.optional();

const cancelBodySchema = z.object({}).optional();

// NUEVO: Esquema para actualizar turnos
const updateBodySchema = z.object({
	scheduledFor: z.string().min(10).optional(),

	professionalUid: z.string().min(1).optional(),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const availabilitySchema = z.object({
	slotMinutes: z.number().int().min(10).max(240),
	days: z
		.array(
			z.object({
				dayOfWeek: z.number().int().min(0).max(6),
				enabled: z.boolean().optional().default(true),
				start: timeSchema.optional(),
				end: timeSchema.optional(),
				ranges: z
					.array(
						z.object({
							start: timeSchema,
							end: timeSchema,
						}),
					)
					.max(8)
					.optional(),
			}),
		)
		.max(7),
});

type AvailabilityRange = {
	start: string;
	end: string;
};

type AvailabilityDay = {
	dayOfWeek: number;
	enabled: boolean;
	start?: string;
	end?: string;
	ranges: AvailabilityRange[];
};

type AvailabilityDoc = {
	clinicId: string;
	professionalUid: string;
	slotMinutes: number;
	days: AvailabilityDay[];
	createdAt?: Timestamp;
	updatedAt?: Timestamp;
	updatedByUid?: string | null;
};

type ClinicAvailabilityDefaultDoc = {
	clinicId: string;
	slotMinutes: number;
	days: AvailabilityDay[];
	createdAt?: Timestamp;
	updatedAt?: Timestamp;
	updatedByUid?: string | null;
};

type AppointmentSlot = {
	time: string;
	startsAt: string;
	available: boolean;
	appointmentId?: string;
};

type AppointmentAvailableDay = {
	date: string;
	freeCount: number;
	firstAvailableTime: string | null;
};

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

function defaultAvailability(
	clinicId: string,
	professionalUid: string,
): AvailabilityDoc {
	return {
		clinicId,
		professionalUid,
		slotMinutes: 30,
		days: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
			dayOfWeek,
			enabled: true,
			start: '08:00',
			end: '18:00',
			ranges: [{ start: '08:00', end: '18:00' }],
		})),
	};
}

function toMinutes(value: string) {
	const [hours, minutes] = value.split(':').map((part) => parseInt(part, 10));
	return (hours || 0) * 60 + (minutes || 0);
}

function toTimeLabel(minutes: number) {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function argentinaDateTime(date: string, time: string) {
	return new Date(`${date}T${time}:00-03:00`);
}

function formatArgentinaDate(date: Date) {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Argentina/Buenos_Aires',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(date);
	const get = (type: string) => parts.find((part) => part.type === type)?.value;
	return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatArgentinaTime(date: Date) {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'America/Argentina/Buenos_Aires',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	}).formatToParts(date);
	const get = (type: string) => parts.find((part) => part.type === type)?.value;
	return `${get('hour')}:${get('minute')}`;
}

function argentinaDayOfWeek(date: string) {
	return argentinaDateTime(date, '12:00').getUTCDay();
}

function addDaysToDateKey(date: string, days: number) {
	const next = argentinaDateTime(date, '12:00');
	next.setUTCDate(next.getUTCDate() + days);
	return formatArgentinaDate(next);
}

function normalizeAvailabilityDay(day: any): AvailabilityDay {
	const ranges: AvailabilityRange[] = Array.isArray(day.ranges)
		? day.ranges
				.filter((range: any) => range?.start && range?.end)
				.map((range: any) => ({
					start: range.start,
					end: range.end,
				}))
		: day.start && day.end
			? [{ start: day.start, end: day.end }]
			: [{ start: '08:00', end: '18:00' }];
	const firstRange = ranges[0] ?? { start: '08:00', end: '18:00' };
	return {
		dayOfWeek: day.dayOfWeek,
		enabled: day.enabled !== false,
		start: firstRange.start,
		end: firstRange.end,
		ranges,
	};
}

function normalizeAvailabilityDays(days: any[] | undefined) {
	return (days ?? []).map(normalizeAvailabilityDay);
}

function validateAvailabilityDays(days: AvailabilityDay[]) {
	for (const day of days) {
		if (!day.enabled) continue;
		if (!day.ranges.length) {
			return 'Enabled days must have at least one availability range';
		}
		const sorted = [...day.ranges].sort(
			(a, b) => toMinutes(a.start) - toMinutes(b.start),
		);
		let previousEnd = -1;
		for (const range of sorted) {
			const start = toMinutes(range.start);
			const end = toMinutes(range.end);
			if (start >= end) {
				return 'Availability start time must be before end time';
			}
			if (start < previousEnd) {
				return 'Availability ranges cannot overlap';
			}
			previousEnd = end;
		}
	}
	return null;
}

function daysBetweenInclusive(from: string, to: string) {
	const fromMs = argentinaDateTime(from, '12:00').getTime();
	const toMs = argentinaDateTime(to, '12:00').getTime();
	return Math.floor((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1;
}

async function getAvailabilityDoc(
	db: Firestore,
	clinicId: string,
	professionalUid: string,
) {
	const id = `${clinicId}_${professionalUid}`;
	const snap = await db.collection('professional_availability').doc(id).get();
	if (!snap.exists) {
		const clinicDefaultSnap = await db
			.collection('clinic_availability_defaults')
			.doc(clinicId)
			.get();
		if (clinicDefaultSnap.exists) {
			const clinicDefault =
				clinicDefaultSnap.data() as ClinicAvailabilityDefaultDoc;
			return {
				...defaultAvailability(clinicId, professionalUid),
				slotMinutes: clinicDefault.slotMinutes,
				days: normalizeAvailabilityDays(clinicDefault.days),
			};
		}
		return defaultAvailability(clinicId, professionalUid);
	}
	const saved = snap.data() as AvailabilityDoc;
	return {
		...defaultAvailability(clinicId, professionalUid),
		...saved,
		days: normalizeAvailabilityDays(saved.days),
	};
}

async function getClinicDefaultAvailability(db: Firestore, clinicId: string) {
	const snap = await db
		.collection('clinic_availability_defaults')
		.doc(clinicId)
		.get();
	if (!snap.exists) {
		return {
			clinicId,
			slotMinutes: 30,
			days: defaultAvailability(clinicId, 'default').days,
		};
	}
	const saved = snap.data() as ClinicAvailabilityDefaultDoc;
	return {
		clinicId,
		slotMinutes: saved.slotMinutes ?? 30,
		days: normalizeAvailabilityDays(
			saved.days ?? defaultAvailability(clinicId, 'default').days,
		),
		createdAt: saved.createdAt,
		updatedAt: saved.updatedAt,
		updatedByUid: saved.updatedByUid,
	};
}

async function assertProfessionalInClinic(
	db: Firestore,
	clinicId: string,
	professionalUid: string,
) {
	const snap = await db
		.collection('clinic_memberships')
		.where('clinicId', '==', clinicId)
		.where('uid', '==', professionalUid)
		.where('role', '==', 'professional')
		.where('isActive', '==', true)
		.limit(1)
		.get();
	return !snap.empty;
}

async function assertPatientAssignedToProfessional(
	db: Firestore,
	patientId: string,
	clinicId: string,
	professionalUid: string,
) {
	const patientSnap = await db.collection('patients').doc(patientId).get();
	if (!patientSnap.exists) return false;
	const patient = patientSnap.data() as {
		clinicId?: string;
		assignedProfessionalUids?: string[];
	};
	return (
		patient.clinicId === clinicId &&
		(patient.assignedProfessionalUids ?? []).includes(professionalUid)
	);
}

async function generateAppointmentSlots(input: {
	db: Firestore;
	clinicId: string;
	professionalUid: string;
	date: string;
	excludeAppointmentId?: string;
}) {
	const availability = await getAvailabilityDoc(
		input.db,
		input.clinicId,
		input.professionalUid,
	);
	const day = availability.days.find(
		(item) => item.dayOfWeek === argentinaDayOfWeek(input.date) && item.enabled,
	);
	if (!day) return { availability, slots: [] as AppointmentSlot[] };

	const snap = await input.db
		.collection('appointments')
		.where('clinicId', '==', input.clinicId)
		.where('professionalUid', '==', input.professionalUid)
		.get();

	const busyByTime = new Map<string, string>();
	snap.docs.forEach((doc) => {
		if (doc.id === input.excludeAppointmentId) return;
		const appointment = doc.data() as AppointmentDoc;
		if (!['scheduled', 'arrived'].includes(appointment.status)) return;
		if (!appointment.scheduledFor) return;
		const scheduledDate = appointment.scheduledFor.toDate();
		if (formatArgentinaDate(scheduledDate) !== input.date) return;
		busyByTime.set(formatArgentinaTime(scheduledDate), doc.id);
	});

	const slots: AppointmentSlot[] = [];
	for (const range of day.ranges) {
		const start = toMinutes(range.start);
		const end = toMinutes(range.end);
		for (
			let minutes = start;
			minutes + availability.slotMinutes <= end;
			minutes += availability.slotMinutes
		) {
			const time = toTimeLabel(minutes);
			const appointmentId = busyByTime.get(time);
			const startsAt = argentinaDateTime(input.date, time);
			slots.push({
				time,
				startsAt: startsAt.toISOString(),
				available: !appointmentId && startsAt.getTime() > Date.now(),
				...(appointmentId ? { appointmentId } : {}),
			});
		}
	}

	return {
		availability,
		slots: slots.sort((a, b) => a.time.localeCompare(b.time)),
	};
}

async function assertSlotAvailable(input: {
	db: Firestore;
	clinicId: string;
	professionalUid: string;
	scheduledMs: number;
	excludeAppointmentId?: string;
}) {
	const date = new Date(input.scheduledMs);
	const dateKey = formatArgentinaDate(date);
	const timeKey = formatArgentinaTime(date);
	const { slots } = await generateAppointmentSlots({
		db: input.db,
		clinicId: input.clinicId,
		professionalUid: input.professionalUid,
		date: dateKey,
		...(input.excludeAppointmentId
			? { excludeAppointmentId: input.excludeAppointmentId }
			: {}),
	});
	const slot = slots.find((item) => item.time === timeKey);
	if (!slot) {
		return { ok: false as const, message: 'Selected time is outside availability' };
	}
	if (!slot.available) {
		return { ok: false as const, message: 'Selected slot is already booked' };
	}
	return { ok: true as const };
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
	email?: string | null,
	patientId?: string | null,
): Promise<{ patientId: string } | null> {
	const patient = await resolvePatientPortalPatientForClinic(db, {
		uid,
		email,
		clinicId,
		patientId,
	});
	return patient && patient.portalAccessEnabled !== false
		? { patientId: patient.id }
		: null;
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

		const professionalExists = await assertProfessionalInClinic(
			db,
			clinicId,
			parsed.data.professionalUid,
		);
		if (!professionalExists) {
			return res.status(400).json({
				success: false,
				message: 'professionalUid is not an active professional in this clinic',
			});
		}

		const slotAvailability = await assertSlotAvailable({
			db,
			clinicId,
			professionalUid: parsed.data.professionalUid,
			scheduledMs,
		});
		if (!slotAvailability.ok) {
			return res.status(409).json({
				success: false,
				message: slotAvailability.message,
			});
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

		const parsedRequest = requestBodySchema.safeParse(req.body ?? {});

		if (!parsedRequest.success) {
			return res.status(400).json({
				success: false,

				message: 'Invalid body',

				errors: parsedRequest.error.flatten(),
			});
		}

		const professionalUid = parsedRequest.data?.professionalUid ?? null;
		const scheduledFor = parsedRequest.data?.scheduledFor ?? null;

		if (!scheduledFor) {
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
		}

		if (scheduledFor && !professionalUid) {
			return res.status(400).json({
				success: false,
				message: 'professionalUid is required when scheduledFor is provided',
			});
		}

		let scheduledTimestamp: Timestamp | null = null;

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

			const isAssigned = await assertPatientAssignedToProfessional(
				db,
				patientCtx.patientId,
				patientCtx.clinicId,
				professionalUid,
			);
			if (!isAssigned) {
				return denyAuthz(
					req,
					res,
					'Patient can only request appointments with assigned professionals',
					403,
				);
			}
		}

		if (scheduledFor && professionalUid) {
			const scheduledMs = Date.parse(scheduledFor);
			if (!Number.isFinite(scheduledMs)) {
				return res.status(400).json({
					success: false,
					message: 'scheduledFor must be a valid ISO date string',
				});
			}
			const slotAvailability = await assertSlotAvailable({
				db,
				clinicId: patientCtx.clinicId,
				professionalUid,
				scheduledMs,
			});
			if (!slotAvailability.ok) {
				return res.status(409).json({
					success: false,
					message: slotAvailability.message,
				});
			}
			scheduledTimestamp = Timestamp.fromMillis(scheduledMs);
		}

		const now = Timestamp.now();

		const doc: AppointmentDoc = {
			clinicId: patientCtx.clinicId,

			patientId: patientCtx.patientId,

			patientUid: auth.uid,

			professionalUid,

			status: scheduledTimestamp ? 'scheduled' : 'requested',

			requestedAt: now,

			scheduledFor: scheduledTimestamp,

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
	const portalMode = req.header('x-portal-mode') === 'patient';

	if (portalMode) {
		const patient = await getPatientLink(db, clinicId, auth.uid, auth.email);

		if (patient) {
			const snap = await db
				.collection('appointments')
				.where('clinicId', '==', clinicId)
				.get();

			const items = sortAppointmentsByCreatedAtDesc(
				snap.docs
					.map((d) => ({
						id: d.id,
						...(d.data() as AppointmentDoc),
					}))
					.filter((appointment) => appointment.patientId === patient.patientId),
			).slice(0, 50);

			return res.status(200).json({ success: true, data: items });
		}

		return denyAuthz(
			req,
			res,
			`User ${auth.uid} is not linked as patient in clinic ${clinicIdHeader}`,
		);
	}

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

	const patient = await getPatientLink(db, clinicId, auth.uid, auth.email);

	if (patient) {
		const snap = await db
			.collection('appointments')
			.where('clinicId', '==', clinicId)
			.get();

		const items = sortAppointmentsByCreatedAtDesc(snap.docs.map((d) => ({
			id: d.id,

			...(d.data() as AppointmentDoc),
		})).filter((appointment) => appointment.patientId === patient.patientId)).slice(0, 50);

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

		const professionalExists = await assertProfessionalInClinic(
			db,
			clinicId,
			parsedBody.data.professionalUid,
		);
		if (!professionalExists) {
			return res.status(400).json({
				success: false,
				message: 'professionalUid is not an active professional in this clinic',
			});
		}

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

			const slotAvailability = await assertSlotAvailable({
				db,
				clinicId,
				professionalUid: parsedBody.data.professionalUid,
				scheduledMs,
				excludeAppointmentId: apptId,
			});
			if (!slotAvailability.ok) {
				return {
					http: 409 as const,
					body: {
						success: false,
						message: slotAvailability.message,
					},
				};
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
					const professionalUid =
						parsedBody.data.professionalUid ?? appt.professionalUid;
					if (!professionalUid) {
						return {
							http: 400 as const,
							body: {
								success: false,
								message: 'professionalUid is required to schedule appointment',
							},
						};
					}
					const professionalExists = await assertProfessionalInClinic(
						db,
						clinicId,
						professionalUid,
					);
					if (!professionalExists) {
						return {
							http: 400 as const,
							body: {
								success: false,
								message:
									'professionalUid is not an active professional in this clinic',
							},
						};
					}
					const slotAvailability = await assertSlotAvailable({
						db,
						clinicId,
						professionalUid,
						scheduledMs,
						excludeAppointmentId: apptId,
					});
					if (!slotAvailability.ok) {
						return {
							http: 409 as const,
							body: {
								success: false,
								message: slotAvailability.message,
							},
						};
					}
					update.scheduledFor = Timestamp.fromMillis(scheduledMs);
				} else {
					return {
						http: 400 as const,
						body: {
							success: false,
							message: 'scheduledFor must be a valid ISO date string',
						},
					};
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
			const portalMode = req.header('x-portal-mode') === 'patient';

			const membership = await getMembership(db, clinicId, auth.uid);

			const patient = await getPatientLink(
				db,
				clinicId,
				auth.uid,
				auth.email,
				appt.patientId,
			);

			if (portalMode) {
				if (!patient) {
					return denyAuthz(req, res, 'No patient link to cancel appointment');
				}

				effectiveRole = 'patient';

				if (appt.clinicId !== clinicId || patient.patientId !== appt.patientId) {
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
			} else if (membership) {
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

router.get(
	'/availability-default/current',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'professional', 'platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.auth!.clinicId!;
		const db = getFirestoreDb();
		const availability = await getClinicDefaultAvailability(db, clinicId);
		return res.status(200).json({
			success: true,
			data: {
				slotMinutes: availability.slotMinutes,
				days: availability.days,
			},
		});
	},
);

router.patch(
	'/availability-default/current',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const parsed = availabilitySchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid availability body',
				errors: parsed.error.flatten(),
			});
		}

		const normalizedDays = normalizeAvailabilityDays(parsed.data.days);
		const invalidRange = validateAvailabilityDays(normalizedDays);
		if (invalidRange) {
			return res.status(400).json({
				success: false,
				message: invalidRange,
			});
		}

		const db = getFirestoreDb();
		const now = Timestamp.now();
		const existing = await db
			.collection('clinic_availability_defaults')
			.doc(clinicId)
			.get();
		const data: ClinicAvailabilityDefaultDoc = {
			clinicId,
			slotMinutes: parsed.data.slotMinutes,
			days: normalizedDays,
			createdAt:
				(existing.data() as ClinicAvailabilityDefaultDoc | undefined)
					?.createdAt ?? now,
			updatedAt: now,
			updatedByUid: auth.uid,
		};

		await db.collection('clinic_availability_defaults').doc(clinicId).set(data);

		return res.status(200).json({
			success: true,
			data: {
				slotMinutes: data.slotMinutes,
				days: data.days,
			},
		});
	},
);

router.get(
	'/availability/:professionalUid',
	authMiddleware,
	requireClinicContext,
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const professionalUid = req.params.professionalUid;
		if (!professionalUid) {
			return res
				.status(400)
				.json({ success: false, message: 'Missing professionalUid' });
		}

		const db = getFirestoreDb();
		const exists = await assertProfessionalInClinic(
			db,
			clinicId,
			professionalUid,
		);
		if (!exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Professional not found in clinic' });
		}

		const availability = await getAvailabilityDoc(db, clinicId, professionalUid);
		return res.status(200).json({
			success: true,
			data: {
				professionalUid,
				slotMinutes: availability.slotMinutes,
				days: availability.days,
			},
		});
	},
);

router.patch(
	'/availability/:professionalUid',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'professional', 'platform_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const professionalUid = req.params.professionalUid;
		if (!professionalUid) {
			return res
				.status(400)
				.json({ success: false, message: 'Missing professionalUid' });
		}

		const db = getFirestoreDb();
		const isOwner = await isIndividualPracticeOwner(clinicId, auth.uid);
		if (auth.role === 'professional' && professionalUid !== auth.uid && !isOwner) {
			return denyAuthz(
				req,
				res,
				'Professional can only edit own availability',
				403,
			);
		}

		const exists = await assertProfessionalInClinic(
			db,
			clinicId,
			professionalUid,
		);
		if (!exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Professional not found in clinic' });
		}

		const parsed = availabilitySchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid availability body',
				errors: parsed.error.flatten(),
			});
		}

		const normalizedDays = normalizeAvailabilityDays(parsed.data.days);
		const invalidRange = validateAvailabilityDays(normalizedDays);
		if (invalidRange) {
			return res.status(400).json({
				success: false,
				message: invalidRange,
			});
		}

		const id = `${clinicId}_${professionalUid}`;
		const now = Timestamp.now();
		const existing = await db.collection('professional_availability').doc(id).get();
		const data: AvailabilityDoc = {
			clinicId,
			professionalUid,
			slotMinutes: parsed.data.slotMinutes,
			days: normalizedDays,
			createdAt:
				(existing.data() as AvailabilityDoc | undefined)?.createdAt ?? now,
			updatedAt: now,
			updatedByUid: auth.uid,
		};

		await db.collection('professional_availability').doc(id).set(data);

		return res.status(200).json({
			success: true,
			data: {
				professionalUid,
				slotMinutes: data.slotMinutes,
				days: data.days,
			},
		});
	},
);

router.get(
	'/slots',

	authMiddleware,

	requireClinicContext,

	async (req: Request, res: Response) => {
		const clinicId = req.auth!.clinicId!;
		const professionalUid = req.query.professionalUid as string | undefined;
		const date = req.query.date as string | undefined;
		if (!professionalUid || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return res.status(400).json({
				success: false,
				message: 'professionalUid and date=YYYY-MM-DD are required',
			});
		}

		const db = getFirestoreDb();
		const exists = await assertProfessionalInClinic(db, clinicId, professionalUid);
		if (!exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Professional not found in clinic' });
		}

		if (req.auth?.role === 'patient' && req.patientContext?.patientId) {
			const isAssigned = await assertPatientAssignedToProfessional(
				db,
				req.patientContext.patientId,
				clinicId,
				professionalUid,
			);
			if (!isAssigned) {
				return denyAuthz(
					req,
					res,
					'Patient can only see slots for assigned professionals',
					403,
				);
			}
		}

		const { availability, slots } = await generateAppointmentSlots({
			db,
			clinicId,
			professionalUid,
			date,
		});
		return res.status(200).json({
			success: true,
			data: {
				slotMinutes: availability.slotMinutes,
				free: slots.filter((slot) => slot.available),
				busy: slots.filter((slot) => !slot.available),
				slots,
			},
		});
	},
);

router.get(
	'/available-days',
	authMiddleware,
	requireClinicContext,
	async (req: Request, res: Response) => {
		const clinicId = req.auth!.clinicId!;
		const professionalUid = req.query.professionalUid as string | undefined;
		const from = req.query.from as string | undefined;
		const to = req.query.to as string | undefined;
		if (
			!professionalUid ||
			!from ||
			!to ||
			!/^\d{4}-\d{2}-\d{2}$/.test(from) ||
			!/^\d{4}-\d{2}-\d{2}$/.test(to)
		) {
			return res.status(400).json({
				success: false,
				message: 'professionalUid, from and to are required as YYYY-MM-DD',
			});
		}

		const daysCount = daysBetweenInclusive(from, to);
		if (daysCount < 1 || daysCount > 90) {
			return res.status(400).json({
				success: false,
				message: 'Date range must be between 1 and 90 days',
			});
		}

		const db = getFirestoreDb();
		const exists = await assertProfessionalInClinic(db, clinicId, professionalUid);
		if (!exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Professional not found in clinic' });
		}

		if (req.auth?.role === 'patient' && req.patientContext?.patientId) {
			const isAssigned = await assertPatientAssignedToProfessional(
				db,
				req.patientContext.patientId,
				clinicId,
				professionalUid,
			);
			if (!isAssigned) {
				return denyAuthz(
					req,
					res,
					'Patient can only see availability for assigned professionals',
					403,
				);
			}
		}

		const days: AppointmentAvailableDay[] = [];
		for (let index = 0; index < daysCount; index += 1) {
			const date = addDaysToDateKey(from, index);
			const { slots } = await generateAppointmentSlots({
				db,
				clinicId,
				professionalUid,
				date,
			});
			const free = slots.filter((slot) => slot.available);
			if (free.length > 0) {
				days.push({
					date,
					freeCount: free.length,
					firstAvailableTime: free[0]?.time ?? null,
				});
			}
		}

		return res.status(200).json({
			success: true,
			data: { days },
		});
	},
);

export const appointmentsRouter = router;
