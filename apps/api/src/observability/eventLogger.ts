import type { Request } from 'express';

type EventPayload = {
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
