export type ApiLogEntry = {
	id: string;
	ts: string;
	method: string;
	endpoint: string;
	url: string;
	ok: boolean;
	status?: number;
	durationMs: number;
	attempt: number;
	retries: number;
	request?: { body?: unknown; headers?: Record<string, string> };
	response?: { body?: unknown };
	error?: string;
};

export type FetchJSONResult =
	| {
			ok: true;
			status: number;
			data: unknown;
			attempts: number;
			durationMs: number;
	  }
	| {
			ok: false;
			status: number;
			data: unknown;
			error: string;
			attempts: number;
			durationMs: number;
	  };

type FetchJSONOptions = {
	baseUrl: string;
	endpoint: string;
	method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
	body?: unknown;
	headers?: Record<string, string>;
	timeoutMs?: number;
	retries?: number;
	onLog?: (entry: ApiLogEntry) => void;
};

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_RETRIES = 1;
const RETRY_DELAY_MS = 350;
const SECRET_KEYS = ['authorization', 'token', 'secret', 'password', 'apiKey'];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createId = () => {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
	return Math.random().toString(36).slice(2, 12);
};

function redactValue(value: unknown): unknown {
	if (!value || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(redactValue);
	return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [k, v]) => {
		const lower = k.toLowerCase();
		const isSecret = SECRET_KEYS.some((secret) => lower.includes(secret));
		acc[k] = isSecret ? '[redacted]' : redactValue(v);
		return acc;
	}, {});
}

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
	if (!headers) return undefined;
	return Object.entries(headers).reduce<Record<string, string>>((acc, [k, v]) => {
		const lower = k.toLowerCase();
		const isSecret = SECRET_KEYS.some((secret) => lower.includes(secret));
		acc[k] = isSecret ? '[redacted]' : v;
		return acc;
	}, {});
}

function buildLogEntry(input: {
	method: string;
	endpoint: string;
	url: string;
	ok: boolean;
	status?: number;
	durationMs: number;
	attempt: number;
	retries: number;
	body?: unknown;
	headers?: Record<string, string>;
	data?: unknown;
	error?: string;
}): ApiLogEntry {
	return {
		id: createId(),
		ts: new Date().toISOString(),
		method: input.method,
		endpoint: input.endpoint,
		url: input.url,
		ok: input.ok,
		status: input.status,
		durationMs: input.durationMs,
		attempt: input.attempt,
		retries: input.retries,
		request: input.body || input.headers ? { body: redactValue(input.body), headers: sanitizeHeaders(input.headers) } : undefined,
		response: input.data !== undefined ? { body: redactValue(input.data) } : undefined,
		error: input.error,
	};
}

function shouldRetry(status: number, errorMessage: string | null, attempt: number, retries: number) {
	if (attempt >= retries) return false;
	if (status === 0) return true;
	if (status >= 500) return true;
	return errorMessage?.toLowerCase().includes('timeout') ?? false;
}

export async function fetchJSON({
	baseUrl,
	endpoint,
	method,
	body,
	headers,
	timeoutMs = DEFAULT_TIMEOUT,
	retries = DEFAULT_RETRIES,
	onLog,
}: FetchJSONOptions): Promise<FetchJSONResult> {
	let lastError: string | null = null;
	let lastData: unknown = null;
	let status = 0;
	let durationMs = 0;

	for (let attempt = 0; attempt <= retries; attempt++) {
		const controller = new AbortController();
		const timer = window.setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
		const started = Date.now();
		const url = `${baseUrl}${endpoint}`;

		try {
			const res = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json',
					...headers,
				},
				body: body ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			});
			durationMs = Date.now() - started;
			status = res.status;
			lastData = await res.json().catch(() => null);

			const ok = res.ok;
			const entry = buildLogEntry({
				method,
				endpoint,
				url,
				ok,
				status,
				durationMs,
				attempt: attempt + 1,
				retries,
				body,
				headers,
				data: lastData,
				error: ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
			});
			onLog?.(entry);

			if (ok) {
				return { ok: true, status, data: lastData, attempts: attempt + 1, durationMs };
			}

			lastError =
				(typeof lastData === 'object' && lastData && 'message' in lastData
					? String((lastData as Record<string, unknown>).message)
					: null) || `HTTP ${res.status} ${res.statusText}`;

			if (!shouldRetry(status, lastError, attempt, retries)) {
				return { ok: false, status, data: lastData, error: lastError, attempts: attempt + 1, durationMs };
			}
		} catch (err) {
			durationMs = Date.now() - started;
			lastError = err instanceof Error ? err.message : 'Network error';
			const entry = buildLogEntry({
				method,
				endpoint,
				url,
				ok: false,
				status,
				durationMs,
				attempt: attempt + 1,
				retries,
				body,
				headers,
				data: lastData,
				error: lastError,
			});
			onLog?.(entry);

			if (!shouldRetry(status, lastError, attempt, retries)) {
				return { ok: false, status, data: lastData, error: lastError, attempts: attempt + 1, durationMs };
			}
		} finally {
			window.clearTimeout(timer);
		}

		await wait(RETRY_DELAY_MS);
	}

	return {
		ok: false,
		status: status || 0,
		data: lastData,
		error: lastError ?? 'Unknown error',
		attempts: retries + 1,
		durationMs,
	};
}
