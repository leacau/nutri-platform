import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getFirestoreDb } from '../firebase/firestore.js';
import { normalizeBilling } from '../billing/plans.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { writeAuditLog } from '../observability/eventLogger.js';
import type { ClinicDoc } from '../types/clinics.js';

export const complianceRouter = Router();

const DEFAULT_POLICY = {
	mfaRequiredForAdmins: true,
	mfaRequiredForProfessionals: true,
	sessionTimeoutMinutes: 15,
	clinicalRecordRetentionYears: 10,
	backupFrequency: 'daily',
	backupRetentionDays: 35,
	internationalTransferProvider: 'Google Cloud / Firebase',
	internationalTransferSafeguards:
		'Clausulas contractuales, controles de acceso, cifrado en transito y reposo.',
	digitalSignatureMode: 'pending_provider',
	privacyPolicyVersion: 'AR-2026-08',
	termsVersion: 'AR-2026-08',
	incidentResponseContact: '',
	dataProtectionContact: '',
};

const policySchema = z.object({
	mfaRequiredForAdmins: z.boolean().optional(),
	mfaRequiredForProfessionals: z.boolean().optional(),
	sessionTimeoutMinutes: z.number().int().min(5).max(240).optional(),
	clinicalRecordRetentionYears: z.number().int().min(10).max(99).optional(),
	backupFrequency: z.enum(['daily', 'weekly']).optional(),
	backupRetentionDays: z.number().int().min(7).max(3650).optional(),
	internationalTransferProvider: z.string().min(2).max(160).optional(),
	internationalTransferSafeguards: z.string().min(8).max(1000).optional(),
	digitalSignatureMode: z
		.enum(['pending_provider', 'electronic_signature', 'certified_digital_signature'])
		.optional(),
	privacyPolicyVersion: z.string().min(1).max(64).optional(),
	termsVersion: z.string().min(1).max(64).optional(),
	incidentResponseContact: z.string().max(160).optional(),
	dataProtectionContact: z.string().max(160).optional(),
});

const dataSubjectRequestSchema = z.object({
	type: z.enum([
		'access',
		'rectification',
		'update',
		'confidentiality',
		'deletion',
		'export',
	]),
	patientId: z.string().min(1).optional(),
	subjectEmail: z.string().email().optional(),
	description: z.string().min(8).max(2000),
});

const updateDataSubjectRequestSchema = z.object({
	status: z.enum(['received', 'in_review', 'fulfilled', 'rejected']).optional(),
	resolution: z.string().min(4).max(2000).optional(),
});

const backupEventSchema = z.object({
	provider: z.string().min(2).max(120),
	location: z.string().min(2).max(160).optional(),
	status: z.enum(['success', 'failed', 'verified']),
	detail: z.string().min(4).max(1000),
});

function toIso(value: unknown): string | null {
	if (value instanceof Timestamp) return value.toDate().toISOString();
	if (value && typeof (value as any).toDate === 'function') {
		return (value as any).toDate().toISOString();
	}
	if (typeof value === 'string') return value;
	return null;
}

function timestampMillis(value: unknown): number {
	if (value instanceof Timestamp) return value.toMillis();
	if (value && typeof (value as any).toDate === 'function') {
		return (value as any).toDate().getTime();
	}
	if (typeof value === 'string') return Date.parse(value) || 0;
	return 0;
}

function serializePolicy(data: Record<string, unknown> | undefined) {
	return {
		...DEFAULT_POLICY,
		...(data ?? {}),
		updatedAt: toIso(data?.updatedAt),
		updatedByUid: data?.updatedByUid ?? null,
	};
}

function serializeRequest(id: string, data: Record<string, unknown>) {
	return {
		id,
		clinicId: data.clinicId,
		type: data.type,
		status: data.status ?? 'received',
		patientId: data.patientId ?? null,
		subjectUid: data.subjectUid ?? null,
		subjectEmail: data.subjectEmail ?? null,
		description: data.description ?? '',
		resolution: data.resolution ?? null,
		createdAt: toIso(data.createdAt),
		updatedAt: toIso(data.updatedAt),
		dueAt: toIso(data.dueAt),
	};
}

function serializeBackupEvent(id: string, data: Record<string, unknown>) {
	return {
		id,
		clinicId: data.clinicId,
		provider: data.provider,
		location: data.location ?? null,
		status: data.status,
		detail: data.detail,
		createdAt: toIso(data.createdAt),
		createdByUid: data.createdByUid ?? null,
	};
}

complianceRouter.get(
	'/policies',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.auth!.clinicId!;
		const snap = await getFirestoreDb()
			.collection('clinic_compliance_policies')
			.doc(clinicId)
			.get();

		return res.status(200).json({
			success: true,
			data: serializePolicy(snap.data()),
		});
	},
);

complianceRouter.patch(
	'/policies',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const parsed = policySchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const clinicId = req.auth!.clinicId!;
		const db = getFirestoreDb();
		if (
			parsed.data.digitalSignatureMode &&
			parsed.data.digitalSignatureMode !== 'pending_provider' &&
			!req.auth?.isPlatformAdmin
		) {
			const clinicSnap = await db.collection('clinics').doc(clinicId).get();
			const clinic = clinicSnap.data() as ClinicDoc | undefined;
			const billing = normalizeBilling(clinic?.billing, 'starter_1_5');
			if (billing.enabledModules.digitalSignature !== true) {
				return res.status(402).json({
					success: false,
					message: 'Digital signature module is not enabled',
				});
			}
		}

		const ref = db
			.collection('clinic_compliance_policies')
			.doc(clinicId);
		const now = Timestamp.now();
		await ref.set(
			{
				...parsed.data,
				clinicId,
				updatedAt: now,
				updatedByUid: req.auth!.uid,
			},
			{ merge: true },
		);

		await writeAuditLog({
			req,
			clinicId,
			actionType: 'COMPLIANCE_POLICY_UPDATED',
			detail: 'Actualizacion de politicas de compliance de la clinica',
			data: { fields: Object.keys(parsed.data) },
		});

		const fresh = await ref.get();
		return res
			.status(200)
			.json({ success: true, data: serializePolicy(fresh.data()) });
	},
);

complianceRouter.get(
	'/checklist',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.auth!.clinicId!;
		const db = getFirestoreDb();
		const [policySnap, backupSnap] = await Promise.all([
			db.collection('clinic_compliance_policies').doc(clinicId).get(),
			db
				.collection('backup_events')
				.where('clinicId', '==', clinicId)
				.limit(100)
				.get(),
		]);

		const policy = serializePolicy(policySnap.data());
		const latestBackup = backupSnap.docs
			.map((doc) => doc.data())
			.sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))[0];
		const latestBackupMs = timestampMillis(latestBackup?.createdAt);
		const backupMaxAgeMs =
			policy.backupFrequency === 'weekly'
				? 8 * 24 * 60 * 60 * 1000
				: 36 * 60 * 60 * 1000;
		const hasRecentBackup =
			Boolean(latestBackupMs) && Date.now() - latestBackupMs <= backupMaxAgeMs;

		const checks = [
			{
				id: 'mfa',
				label: 'MFA requerido para roles sensibles',
				status:
					policy.mfaRequiredForAdmins && policy.mfaRequiredForProfessionals
						? 'configured'
						: 'pending',
				detail:
					'La aplicacion exige politica MFA; falta verificar enrolamiento real por proveedor Auth.',
			},
			{
				id: 'retention',
				label: 'Retencion de historia clinica',
				status:
					Number(policy.clinicalRecordRetentionYears) >= 10
						? 'configured'
						: 'pending',
				detail: `${policy.clinicalRecordRetentionYears} años configurados.`,
			},
			{
				id: 'backup',
				label: 'Evidencia de backup reciente',
				status: hasRecentBackup ? 'configured' : 'pending',
				detail: latestBackup
					? `Ultimo backup ${toIso(latestBackup.createdAt)} (${latestBackup.status}).`
					: 'No hay evidencia de backup registrada.',
			},
			{
				id: 'signature',
				label: 'Firma de asientos clinicos',
				status:
					policy.digitalSignatureMode === 'certified_digital_signature'
						? 'configured'
						: 'external_required',
				detail: `Modo actual: ${policy.digitalSignatureMode}.`,
			},
			{
				id: 'transfer',
				label: 'Transferencias internacionales/cloud',
				status: policy.internationalTransferSafeguards
					? 'configured'
					: 'pending',
				detail: policy.internationalTransferProvider,
			},
			{
				id: 'contacts',
				label: 'Contacto de privacidad/incidentes',
				status:
					policy.dataProtectionContact && policy.incidentResponseContact
						? 'configured'
						: 'pending',
				detail: 'Debe informarse un canal operativo para titulares e incidentes.',
			},
		];

		return res.status(200).json({ success: true, data: { policy, checks } });
	},
);

complianceRouter.get(
	'/data-subject-requests',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'platform_admin', 'patient'),
	async (req: Request, res: Response) => {
		const clinicId = req.auth!.clinicId!;
		const db = getFirestoreDb();
		let query = db
			.collection('data_subject_requests')
			.where('clinicId', '==', clinicId)
			.limit(500);
		const snap = await query.get();
		const data = snap.docs
			.map((doc) => ({ id: doc.id, item: doc.data() }))
			.filter(({ item }) => {
				if (req.auth!.role !== 'patient') return true;
				return item.subjectUid === req.auth!.uid;
			})
			.sort(
				(a, b) =>
					timestampMillis(b.item.createdAt) -
					timestampMillis(a.item.createdAt),
			)
			.map(({ id, item }) => serializeRequest(id, item));

		return res.status(200).json({ success: true, data });
	},
);

complianceRouter.post(
	'/data-subject-requests',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'platform_admin', 'patient'),
	async (req: Request, res: Response) => {
		const parsed = dataSubjectRequestSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}

		const clinicId = req.auth!.clinicId!;
		const now = Timestamp.now();
		const dueAt = Timestamp.fromMillis(
			now.toMillis() + 5 * 24 * 60 * 60 * 1000,
		);
		const ref = getFirestoreDb().collection('data_subject_requests').doc();
		const doc = {
			id: ref.id,
			clinicId,
			...parsed.data,
			patientId:
				parsed.data.patientId ??
				(req.auth!.role === 'patient' ? req.patientContext?.patientId : null),
			subjectUid: req.auth!.role === 'patient' ? req.auth!.uid : null,
			subjectEmail: parsed.data.subjectEmail ?? req.auth!.email ?? null,
			status: 'received',
			createdAt: now,
			updatedAt: now,
			dueAt,
			createdByUid: req.auth!.uid,
		};
		await ref.set(doc);

		await writeAuditLog({
			req,
			clinicId,
			patientId: doc.patientId ?? null,
			actionType: 'DATA_SUBJECT_REQUEST_CREATED',
			detail: `Solicitud de derechos personales creada: ${parsed.data.type}`,
			data: { requestId: ref.id, type: parsed.data.type },
		});

		return res
			.status(201)
			.json({ success: true, data: serializeRequest(ref.id, doc) });
	},
);

complianceRouter.patch(
	'/data-subject-requests/:requestId',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const parsed = updateDataSubjectRequestSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}
		const requestId = req.params.requestId;
		if (!requestId) {
			return res.status(400).json({ success: false, message: 'Missing requestId' });
		}

		const ref = getFirestoreDb().collection('data_subject_requests').doc(requestId);
		const snap = await ref.get();
		if (!snap.exists) {
			return res.status(404).json({ success: false, message: 'Not found' });
		}
		const existing = snap.data()!;
		const clinicId = req.auth!.clinicId!;
		if (existing.clinicId !== clinicId) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}

		await ref.update({
			...parsed.data,
			updatedAt: Timestamp.now(),
			updatedByUid: req.auth!.uid,
		});

		await writeAuditLog({
			req,
			clinicId,
			patientId: existing.patientId ?? null,
			actionType: 'DATA_SUBJECT_REQUEST_UPDATED',
			detail: `Solicitud de derechos personales actualizada: ${requestId}`,
			data: { requestId, fields: Object.keys(parsed.data) },
		});

		const fresh = await ref.get();
		return res
			.status(200)
			.json({ success: true, data: serializeRequest(fresh.id, fresh.data()!) });
	},
);

complianceRouter.get(
	'/backup-events',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const clinicId = req.auth!.clinicId!;
		const snap = await getFirestoreDb()
			.collection('backup_events')
			.where('clinicId', '==', clinicId)
			.limit(500)
			.get();
		const data = snap.docs
			.map((doc) => ({ id: doc.id, item: doc.data() }))
			.sort(
				(a, b) =>
					timestampMillis(b.item.createdAt) -
					timestampMillis(a.item.createdAt),
			)
			.map(({ id, item }) => serializeBackupEvent(id, item));

		return res.status(200).json({ success: true, data });
	},
);

complianceRouter.post(
	'/backup-events',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'platform_admin'),
	async (req: Request, res: Response) => {
		const parsed = backupEventSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid body',
				errors: parsed.error.flatten(),
			});
		}
		const clinicId = req.auth!.clinicId!;
		const ref = getFirestoreDb().collection('backup_events').doc();
		const doc = {
			id: ref.id,
			clinicId,
			...parsed.data,
			createdAt: Timestamp.now(),
			createdByUid: req.auth!.uid,
		};
		await ref.set(doc);

		await writeAuditLog({
			req,
			clinicId,
			actionType: 'BACKUP_EVIDENCE_CREATED',
			detail: `Evidencia de backup registrada: ${parsed.data.status}`,
			data: { backupEventId: ref.id, provider: parsed.data.provider },
		});

		return res
			.status(201)
			.json({ success: true, data: serializeBackupEvent(ref.id, doc) });
	},
);
