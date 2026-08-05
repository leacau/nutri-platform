import type {
	Appointment,
	ClinicalRecord,
	Patient,
	SessionResponse,
} from './types';

export const DEFAULT_API_BASE =
	'https://amsa-core-api-418425481470.southamerica-east1.run.app/api';

type ApiEnvelope<T> = {
	success: boolean;
	data: T;
	message?: string;
};

export function parseDate(value: unknown): Date | null {
	if (!value) return null;
	if (value instanceof Date) return value;
	if (typeof value === 'object' && value !== null) {
		const maybeTimestamp = value as { _seconds?: number; seconds?: number };
		if (typeof maybeTimestamp._seconds === 'number') {
			return new Date(maybeTimestamp._seconds * 1000);
		}
		if (typeof maybeTimestamp.seconds === 'number') {
			return new Date(maybeTimestamp.seconds * 1000);
		}
	}
	if (typeof value === 'string') {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}
	return null;
}

async function request<T>(
	apiBase: string,
	path: string,
	token: string,
	clinicId?: string | null,
): Promise<T> {
	const response = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...(clinicId ? { 'X-Clinic-Id': clinicId } : {}),
		},
	});

	const text = await response.text();
	const json = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;

	if (!response.ok || !json?.success) {
		throw new Error(json?.message || `Request failed ${response.status}`);
	}

	return json.data;
}

export const portalApi = {
	session: (apiBase: string, token: string) =>
		request<SessionResponse>(apiBase, '/session', token),
	patient: (apiBase: string, token: string, clinicId: string, patientId: string) =>
		request<Patient>(apiBase, `/patients/${patientId}`, token, clinicId),
	appointments: (apiBase: string, token: string, clinicId: string) =>
		request<Appointment[]>(apiBase, '/appointments', token, clinicId),
	records: (apiBase: string, token: string, clinicId: string, patientId: string) =>
		request<ClinicalRecord[]>(
			apiBase,
			`/clinical-records/patient/${patientId}`,
			token,
			clinicId,
		),
};
