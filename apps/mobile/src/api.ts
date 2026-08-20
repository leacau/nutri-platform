import type {
	Appointment,
	AppointmentAvailableDaysResponse,
	AppointmentSlotsResponse,
	ClinicalRecord,
	FoodLog,
	FoodLogDays,
	Patient,
	SessionResponse,
	UserAccount,
} from './types';

export const DEFAULT_API_BASE =
	process.env.EXPO_PUBLIC_API_BASE_URL ||
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
	options: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
	const response = await fetch(`${apiBase.replace(/\/$/, '')}${path}`, {
		method: options.method ?? 'GET',
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json',
			...(clinicId ? { 'X-Clinic-Id': clinicId } : {}),
			...(clinicId ? { 'X-Portal-Mode': 'patient' } : {}),
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
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
	slots: (
		apiBase: string,
		token: string,
		clinicId: string,
		professionalUid: string,
		date: string,
	) =>
		request<AppointmentSlotsResponse>(
			apiBase,
			`/appointments/slots?professionalUid=${encodeURIComponent(
				professionalUid,
			)}&date=${encodeURIComponent(date)}`,
			token,
			clinicId,
		),
	availableDays: (
		apiBase: string,
		token: string,
		clinicId: string,
		professionalUid: string,
		from: string,
		to: string,
	) =>
		request<AppointmentAvailableDaysResponse>(
			apiBase,
			`/appointments/available-days?professionalUid=${encodeURIComponent(
				professionalUid,
			)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
			token,
			clinicId,
		),
	requestAppointment: (
		apiBase: string,
		token: string,
		clinicId: string,
		body: { professionalUid: string; scheduledFor: string },
	) =>
		request<Appointment>(apiBase, '/appointments/request', token, clinicId, {
			method: 'POST',
			body,
		}),
	cancelAppointment: (
		apiBase: string,
		token: string,
		clinicId: string,
		appointmentId: string,
	) =>
		request<Appointment>(
			apiBase,
			`/appointments/${appointmentId}/cancel`,
			token,
			clinicId,
			{ method: 'POST' },
		),
	records: (apiBase: string, token: string, clinicId: string, patientId: string) =>
		request<ClinicalRecord[]>(
			apiBase,
			`/clinical-records/patient/${patientId}`,
			token,
			clinicId,
		),
	professionals: (apiBase: string, token: string, clinicId: string) =>
		request<UserAccount[]>(
			apiBase,
			`/clinics/${clinicId}/professionals`,
			token,
			clinicId,
		),
	foodLogs: (
		apiBase: string,
		token: string,
		clinicId: string,
		patientId: string,
		weekStart: string,
	) =>
		request<FoodLog[]>(
			apiBase,
			`/food-logs/patient/${patientId}?weekStart=${weekStart}`,
			token,
			clinicId,
		),
	saveFoodLog: (
		apiBase: string,
		token: string,
		clinicId: string,
		body: {
			patientId: string;
			weekStart: string;
			days: FoodLogDays;
			sharedWithProfessionalUids: string[];
		},
	) =>
		request<FoodLog>(apiBase, '/food-logs', token, clinicId, {
			method: 'POST',
			body,
		}),
	completeRequiredPasswordChange: (apiBase: string, token: string) =>
		request<{ forcePasswordChange: boolean }>(
			apiBase,
			'/users/me/password-change-completed',
			token,
			null,
			{ method: 'POST' },
		),
};
