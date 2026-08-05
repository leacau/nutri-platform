import { createHash, randomUUID } from 'crypto';
import type { Request } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirestoreDb } from '../firebase/firestore.js';

type EventPayload = {
	auditId: string;
	ts: string;
	event: string;
	actorUid: string | null;
	actorRole: string | null;
	clinicId: string | null;
	data?: Record<string, unknown>;
};

type LogEventOptions = {
	req?: Request;
	clinicId?: string | null;
	data?: Record<string, unknown>;
};

type AuditActionType =
	| 'SESSION_READ'
	| 'CLINICAL_RECORD_READ'
	| 'CLINICAL_RECORD_CREATED'
	| 'CLINICAL_RECORD_RECTIFIED'
	| 'CLINICAL_RECORD_BLOCKED'
	| 'CLINICAL_RECORD_METADATA_UPDATED'
	| 'CLINICAL_RECORD_EXPORTED'
	| 'AUTHZ_DENIED'
	| 'PRIVILEGE_CHANGED'
	| 'PATIENT_CONSENT_UPDATED'
	| 'COMPLIANCE_POLICY_UPDATED'
	| 'DATA_SUBJECT_REQUEST_CREATED'
	| 'DATA_SUBJECT_REQUEST_UPDATED'
	| 'BACKUP_EVIDENCE_CREATED'
	| 'CLINIC_ARCHIVED';

type WriteAuditLogOptions = {
	req: Request;
	clinicId?: string | null;
	patientId?: string | null;
	actionType: AuditActionType;
	detail: string;
	data?: Record<string, unknown>;
};

export function logEvent(event: string, opts: LogEventOptions = {}) {
	const payload: EventPayload = {
		auditId:
			typeof randomUUID === 'function'
				? randomUUID()
				: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
		ts: new Date().toISOString(),
		event,
		actorUid: opts.req?.auth?.uid ?? null,
		actorRole: opts.req?.auth?.role ?? null,
		clinicId: opts.clinicId ?? opts.req?.auth?.clinicId ?? null,
		...(opts.data ? { data: opts.data } : {}),
	};

	console.info(JSON.stringify(payload));
	return payload;
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}
	const obj = value as Record<string, unknown>;
	return `{${Object.keys(obj)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
		.join(',')}}`;
}

function requestIp(req: Request): string | null {
	const forwardedFor = req.header('x-forwarded-for');
	if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null;
	return req.ip ?? req.socket.remoteAddress ?? null;
}

function timestampMillis(value: unknown): number {
	if (value instanceof Timestamp) return value.toMillis();
	if (value && typeof (value as any).toDate === 'function') {
		return (value as any).toDate().getTime();
	}
	if (typeof value === 'string') return Date.parse(value) || 0;
	return 0;
}

export async function writeAuditLog({
	req,
	clinicId,
	patientId,
	actionType,
	detail,
	data,
}: WriteAuditLogOptions) {
	try {
		const db = getFirestoreDb();
		const now = Timestamp.now();
		const resolvedClinicId = clinicId ?? req.auth?.clinicId ?? null;

		const previousSnap = resolvedClinicId
			? await db
					.collection('audit_logs')
					.where('clinicId', '==', resolvedClinicId)
					.limit(1000)
					.get()
			: await db
					.collection('audit_logs')
					.orderBy('createdAt', 'desc')
					.limit(1)
					.get();
		const previousHash =
			previousSnap.docs
				.map((doc) => doc.data())
				.sort(
					(a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt),
				)[0]?.hash ?? null;
		const ref = db.collection('audit_logs').doc();
		const payload = {
			id: ref.id,
			createdAt: now,
			actorUid: req.auth?.uid ?? null,
			actorRole: req.auth?.role ?? null,
			clinicId: resolvedClinicId,
			patientId: patientId ?? null,
			actionType,
			detail,
			ipOrigin: requestIp(req),
			userAgent: req.header('user-agent') ?? null,
			data: data ?? {},
			previousHash,
		};
		const hash = createHash('sha256')
			.update(stableStringify(payload))
			.digest('hex');

		await ref.set({ ...payload, hash });
		return { ...payload, hash };
	} catch (error) {
		console.error('[audit] failed to persist audit log', error);
		return null;
	}
}
