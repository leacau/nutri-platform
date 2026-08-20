import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { z } from 'zod';

import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { denyAuthz } from '../security/authz.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import { getDocInClinic } from '../security/getDocInClinic.js';
import {
	effectiveClinicalRole,
	isIndividualPracticeOwner,
} from '../security/individualPractice.js';
import type { PatientDoc } from '../types/patients.js';

export const foodLogsRouter = Router();

const dayKeys = [
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday',
] as const;

const mealKeys = [
	'breakfast',
	'morningSnack',
	'lunch',
	'afternoonSnack',
	'dinner',
] as const;

const mealEntrySchema = z.object({
	time: z.string().max(10).optional().default(''),
	detail: z.string().max(2000).optional().default(''),
});

const daySchema = z.object(
	Object.fromEntries(mealKeys.map((meal) => [meal, mealEntrySchema])) as Record<
		(typeof mealKeys)[number],
		typeof mealEntrySchema
	>,
);

const daysSchema = z.object(
	Object.fromEntries(dayKeys.map((day) => [day, daySchema])) as Record<
		(typeof dayKeys)[number],
		typeof daySchema
	>,
);

const upsertFoodLogSchema = z.object({
	patientId: z.string().min(1),
	weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	days: daysSchema,
	sharedWithProfessionalUids: z.array(z.string().min(1)).optional().default([]),
});

const professionalNoteSchema = z.object({
	scope: z.enum(['week', 'day', 'meal']),
	dayKey: z.enum(dayKeys).optional(),
	mealKey: z.enum(mealKeys).optional(),
	content: z.string().min(1).max(5000),
	visibleToPatient: z.boolean().optional().default(false),
});

type FoodLogDoc = {
	clinicId: string;
	patientId: string;
	createdByPatientUid: string;
	weekStart: string;
	days: z.infer<typeof daysSchema>;
	sharedWithProfessionalUids: string[];
	professionalNotes?: FoodLogNote[];
	createdAt: Timestamp;
	updatedAt: Timestamp;
};

type FoodLogNote = {
	id: string;
	scope: 'week' | 'day' | 'meal';
	dayKey?: (typeof dayKeys)[number];
	mealKey?: (typeof mealKeys)[number];
	content: string;
	visibleToPatient: boolean;
	professionalUid: string;
	createdAt: Timestamp;
	updatedAt: Timestamp;
};

function serializeTimestamp(value: unknown) {
	if (value && typeof (value as any).toDate === 'function') {
		return (value as Timestamp).toDate().toISOString();
	}
	return value ?? null;
}

function serializeFoodLog(id: string, log: FoodLogDoc, viewerUid: string, role: string) {
	const isPatient = role === 'patient';
	const professionalNotes = (log.professionalNotes ?? []).filter((note) => {
		if (isPatient) return note.visibleToPatient === true;
		return note.professionalUid === viewerUid || note.visibleToPatient === true;
	});

	return {
		id,
		clinicId: log.clinicId,
		patientId: log.patientId,
		weekStart: log.weekStart,
		days: log.days,
		sharedWithProfessionalUids: log.sharedWithProfessionalUids ?? [],
		professionalNotes: professionalNotes.map((note) => ({
			...note,
			createdAt: serializeTimestamp(note.createdAt),
			updatedAt: serializeTimestamp(note.updatedAt),
		})),
		createdAt: serializeTimestamp(log.createdAt),
		updatedAt: serializeTimestamp(log.updatedAt),
	};
}

function assertPatientCanUseLog(req: Request, res: Response, patientId: string) {
	if (req.patientContext?.patientId === patientId) return true;
	if (req.auth?.role !== 'patient') return true;
	if (req.patientContext?.patientId !== patientId) {
		denyAuthz(req, res, 'Patient can only manage own food log', 403);
		return false;
	}
	return true;
}

function sanitizeSharedProfessionals(
	requestedUids: string[],
	patient: PatientDoc,
) {
	const assigned = new Set(patient.assignedProfessionalUids ?? []);
	return Array.from(new Set(requestedUids.filter((uid) => assigned.has(uid))));
}

async function canProfessionalReadLog(input: {
	clinicId: string;
	authUid: string;
	authRole: string | null;
	patient: PatientDoc;
	log?: FoodLogDoc;
}) {
	const isOwner = await isIndividualPracticeOwner(input.clinicId, input.authUid);
	const role = effectiveClinicalRole(input.authRole, isOwner);
	if (role !== 'professional') return false;
	if (isOwner) return true;
	if (!(input.patient.assignedProfessionalUids ?? []).includes(input.authUid)) {
		return false;
	}
	if (!input.log) return true;
	return (input.log.sharedWithProfessionalUids ?? []).includes(input.authUid);
}

foodLogsRouter.get(
	'/patient/:patientId',
	requireClinicContext,
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const patientId = req.params.patientId;
		if (!patientId) {
			return res.status(400).json({ success: false, message: 'Missing patient id' });
		}

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(
			db,
			'patients',
			patientId,
			clinicId,
		);
		if (!patient) {
			return res.status(404).json({ success: false, message: 'Patient not found' });
		}
		if (!assertPatientCanUseLog(req, res, patientId)) return;

		const weekStart =
			typeof req.query.weekStart === 'string' ? req.query.weekStart : null;
		const snap = await db
			.collection('food_logs')
			.where('clinicId', '==', clinicId)
			.where('patientId', '==', patientId)
			.get();

		const allLogs = snap.docs
			.map((doc) => ({ id: doc.id, ...(doc.data() as FoodLogDoc) }))
			.filter((log) => !weekStart || log.weekStart === weekStart)
			.sort((a, b) => b.weekStart.localeCompare(a.weekStart));

		const visibleLogs = [];
		for (const log of allLogs) {
			if (auth.role === 'patient') {
				visibleLogs.push(log);
				continue;
			}
			if (
				await canProfessionalReadLog({
					clinicId,
					authUid: auth.uid,
					authRole: auth.role,
					patient,
					log,
				})
			) {
				visibleLogs.push(log);
			}
		}

		return res.status(200).json({
			success: true,
			data: visibleLogs.map((log) =>
				serializeFoodLog(log.id, log, auth.uid, auth.role ?? ''),
			),
		});
	},
);

foodLogsRouter.post(
	'/',
	requireClinicContext,
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const parsed = upsertFoodLogSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}
		if (
			auth.role !== 'patient' &&
			req.patientContext?.patientId !== parsed.data.patientId
		) {
			return denyAuthz(req, res, 'Only patients can submit food logs', 403);
		}
		if (!assertPatientCanUseLog(req, res, parsed.data.patientId)) return;

		const db = getFirestoreDb();
		const patient = await getDocInClinic<PatientDoc>(
			db,
			'patients',
			parsed.data.patientId,
			clinicId,
		);
		if (!patient) {
			return res.status(404).json({ success: false, message: 'Patient not found' });
		}

		const sharedWithProfessionalUids = sanitizeSharedProfessionals(
			parsed.data.sharedWithProfessionalUids,
			patient,
		);
		const existingSnap = await db
			.collection('food_logs')
			.where('clinicId', '==', clinicId)
			.where('patientId', '==', parsed.data.patientId)
			.where('weekStart', '==', parsed.data.weekStart)
			.limit(1)
			.get();

		const now = Timestamp.now();
		const ref = existingSnap.docs[0]?.ref ?? db.collection('food_logs').doc();
		const current = existingSnap.docs[0]?.data() as FoodLogDoc | undefined;
		const nextLog: FoodLogDoc = {
			clinicId,
			patientId: parsed.data.patientId,
			createdByPatientUid: current?.createdByPatientUid ?? auth.uid,
			weekStart: parsed.data.weekStart,
			days: parsed.data.days,
			sharedWithProfessionalUids,
			professionalNotes: current?.professionalNotes ?? [],
			createdAt: current?.createdAt ?? now,
			updatedAt: now,
		};

		await ref.set(nextLog, { merge: true });

		return res.status(existingSnap.empty ? 201 : 200).json({
			success: true,
			data: serializeFoodLog(ref.id, nextLog, auth.uid, auth.role ?? ''),
		});
	},
);

foodLogsRouter.post(
	'/:logId/notes',
	requireClinicContext,
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const parsed = professionalNoteSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}
		if (parsed.data.scope === 'day' && !parsed.data.dayKey) {
			return res.status(400).json({ success: false, message: 'Missing dayKey' });
		}
		if (parsed.data.scope === 'meal' && (!parsed.data.dayKey || !parsed.data.mealKey)) {
			return res
				.status(400)
				.json({ success: false, message: 'Missing dayKey or mealKey' });
		}

		const db = getFirestoreDb();
		const logId = req.params.logId;
		if (!logId) {
			return res.status(400).json({ success: false, message: 'Missing food log id' });
		}
		const ref = db.collection('food_logs').doc(logId);
		const snap = await ref.get();
		if (!snap.exists) {
			return res.status(404).json({ success: false, message: 'Food log not found' });
		}
		const log = snap.data() as FoodLogDoc;
		if (log.clinicId !== clinicId) {
			return denyAuthz(req, res, 'Cross-clinic access denied', 403);
		}
		const patient = await getDocInClinic<PatientDoc>(
			db,
			'patients',
			log.patientId,
			clinicId,
		);
		if (!patient) {
			return res.status(404).json({ success: false, message: 'Patient not found' });
		}
		const canRead = await canProfessionalReadLog({
			clinicId,
			authUid: auth.uid,
			authRole: auth.role,
			patient,
			log,
		});
		if (!canRead) {
			return denyAuthz(
				req,
				res,
				'Professional can only annotate shared food logs for assigned patients',
				403,
			);
		}

		const now = Timestamp.now();
		const note: FoodLogNote = {
			id: crypto.randomUUID(),
			scope: parsed.data.scope,
			...(parsed.data.dayKey ? { dayKey: parsed.data.dayKey } : {}),
			...(parsed.data.mealKey ? { mealKey: parsed.data.mealKey } : {}),
			content: parsed.data.content,
			visibleToPatient: parsed.data.visibleToPatient,
			professionalUid: auth.uid,
			createdAt: now,
			updatedAt: now,
		};
		const professionalNotes = [...(log.professionalNotes ?? []), note];

		await ref.update({ professionalNotes, updatedAt: now });

		return res.status(201).json({
			success: true,
			data: {
				...note,
				createdAt: now.toDate().toISOString(),
				updatedAt: now.toDate().toISOString(),
			},
		});
	},
);
