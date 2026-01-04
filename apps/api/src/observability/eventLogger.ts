import { randomUUID } from 'crypto';
import type { Request } from 'express';

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
