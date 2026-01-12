import {
	Appointment,
	AuditEvent,
	Clinic,
	ClinicSettings,
	MeResponse,
	Membership,
	MessageTemplate,
	Patient,
	UserAccount,
} from './types';

type RequestOptions<T> = {
	method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
	body?: unknown;
	token?: string;
	clinicId?: string;
	mockFallback?: () => T | Promise<T>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

type ApiResponse<T> = {
	success: boolean;
	data: T;
	message?: string;
};

function joinUrl(base: string, path: string): string {
	// Base puede venir como "https://.../api" o "/api"
	// Path suele venir como "/session"
	const b = base.endsWith('/') ? base.slice(0, -1) : base;
	const p = path.startsWith('/') ? path : `/${path}`;
	return `${b}${p}`;
}

async function safeReadText(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch {
		return '';
	}
}

async function request<T>(
	path: string,
	options: RequestOptions<T> = {}
): Promise<T> {
	const headers = new Headers({
		'Content-Type': 'application/json',
	});

	if (options.token) {
		headers.set('Authorization', `Bearer ${options.token}`);
	}

	if (options.clinicId) {
		headers.set('X-Clinic-Id', options.clinicId);
	}

	const url = joinUrl(API_BASE, path);

	try {
		const res = await fetch(url, {
			method: options.method || 'GET',
			headers,
			body: options.body ? JSON.stringify(options.body) : undefined,
		});

		if (res.status === 401) throw new Error('unauthorized');
		if (res.status === 403) throw new Error('forbidden');

		if (!res.ok) {
			if (USE_MOCKS && options.mockFallback) {
				return await options.mockFallback();
			}

			const text = await safeReadText(res);
			// Si el backend devuelve JSON error, lo mostramos
			// Si devuelve text/plain (Cloud Run), también
			throw new Error(
				text || `Request failed: ${res.status} ${res.statusText}`
			);
		}

		// Algunas respuestas pueden no ser JSON (pero en tu API casi todo es JSON)
		const contentType = res.headers.get('content-type') || '';
		if (!contentType.includes('application/json')) {
			// fallback: devolvemos texto como any
			const text = await safeReadText(res);
			return text as unknown as T;
		}

		const json = await res.json();

		if (
			json &&
			typeof json === 'object' &&
			'success' in json &&
			'data' in json
		) {
			return (json as ApiResponse<T>).data as T;
		}

		return json as T;
	} catch (error) {
		if (USE_MOCKS && options.mockFallback) {
			return await options.mockFallback();
		}
		throw error;
	}
}

const mockDb: any = {
	// ... mocks ...
};

export const apiClient = {
	// ✅ FIX: existe como método de apiClient (como lo usa register/page.tsx)
	upsertUserProfile: (
		data: { name: string; email?: string; dni?: string },
		token?: string
	) =>
		request<{ uid: string }>('/users/self', {
			method: 'POST',
			token,
			body: data,
		}),

	me: (token?: string) =>
		request<any>('/session', {
			token,
			mockFallback: () => mockDb.me,
		}).then((data) => {
			const memberships: Membership[] = [];

			if (data.staffClinics) {
				memberships.push(
					...data.staffClinics.map((c: any) => ({
						clinicId: c.clinicId,
						role: c.role,
						clinicName: c.clinicName || c.clinicId,
					}))
				);
			}

			if (data.patientClinics) {
				memberships.push(
					...data.patientClinics.map((c: any) => ({
						clinicId: c.clinicId,
						role: 'patient',
						clinicName: c.clinicName || 'Clínica',
					}))
				);
			}

			return {
				uid: data.uid,
				email: data.email,
				platformRole: data.isPlatformAdmin ? 'platform_admin' : null,
				memberships,
			} as MeResponse;
		}),

	clinics: (token?: string) =>
		request<any>('/clinics/mine', {
			token,
			mockFallback: () => mockDb.clinics,
		}).then((data) => {
			const list = data.clinics || [];
			return list.map((c: any) => ({
				id: c.clinicId,
				name: c.clinicName || c.clinicId,
				branding: null,
			})) as Clinic[];
		}),

	clinicSettings: (clinicId: string, token?: string) =>
		request<ClinicSettings>(`/clinics/${clinicId}`, {
			token,
			clinicId,
			mockFallback: () => ({
				branding: { accentColor: '#2F8F7B' },
				reminderPreferences: { whatsappEnabled: true, emailEnabled: true },
			}),
		}),

	saveClinicSettings: (
		clinicId: string,
		settings: Partial<ClinicSettings>,
		token?: string
	) =>
		request<ClinicSettings>(`/clinics/${clinicId}/settings`, {
			method: 'PATCH',
			body: settings,
			token,
			clinicId,
			mockFallback: () => settings as ClinicSettings,
		}),

	patients: (clinicId: string, token?: string) =>
		request<Patient[]>('/patients', {
			token,
			clinicId,
			mockFallback: () => [],
		}),

	patient: (id: string, clinicId: string, token?: string) =>
		request<Patient>(`/patients/${id}`, {
			token,
			clinicId,
			mockFallback: () => {
				throw new Error('Mock patient not found');
			},
		}),

	lookupPatient: (dni: string, clinicId: string, token?: string) =>
		request<{
			id: string;
			name: string;
			email?: string | null;
			phone?: string | null;
			clinicId: string;
			assignedProfessionalUids?: string[];
		} | null>(`/patients/lookup?dni=${dni}&clinicId=${clinicId}`, {
			token,
			clinicId,
			mockFallback: () => null,
		}),

	createPatient: (clinicId: string, data: Partial<Patient>, token?: string) =>
		request<Patient>('/patients', {
			method: 'POST',
			token,
			clinicId,
			body: { ...data },
			mockFallback: () => ({ id: 'mock-id', ...data } as Patient),
		}),

	appointments: (clinicId: string, token?: string) =>
		request<Appointment[]>('/appointments', {
			token,
			clinicId,
			mockFallback: () => [],
		}),

	scheduleAppointment: (
		body: Partial<Appointment>,
		clinicId: string,
		token?: string
	) =>
		request<Appointment>(`/appointments/${body.id || 'new'}/schedule`, {
			method: 'POST',
			token,
			clinicId,
			body,
			mockFallback: () => ({ ...body } as Appointment),
		}),

	requestAppointment: (body: any, clinicId: string, token?: string) =>
		request<Appointment>('/appointments/request', {
			method: 'POST',
			token,
			clinicId,
			body,
		}),

	cancelAppointment: (id: string, clinicId: string, token?: string) =>
		request<Appointment>(`/appointments/${id}/cancel`, {
			method: 'POST',
			token,
			clinicId,
			mockFallback: () => ({ id, status: 'cancelled' } as any),
		}),

	templates: (clinicId: string, token?: string) =>
		request<MessageTemplate[]>('/templates', {
			token,
			clinicId,
			mockFallback: () => [],
		}),

	audit: (clinicId: string, token?: string) =>
		request<AuditEvent[]>('/audit', {
			token,
			clinicId,
			mockFallback: () => [],
		}),

	professionals: (clinicId: string, token?: string) =>
		request<UserAccount[]>(`/clinics/${clinicId}/members`, {
			token,
			clinicId,
			mockFallback: () => [],
		}).then((members: any) =>
			members.filter((m: any) => m.role === 'professional')
		),

	staff: (clinicId: string, token?: string) =>
		request<UserAccount[]>(`/clinics/${clinicId}/members`, {
			token,
			clinicId,
			mockFallback: () => [],
		}).then((members: any) => members.filter((m: any) => m.role === 'staff')),

	lookupUser: (dni: string, token?: string) =>
		request<{ uid: string; name: string; email: string } | null>(
			'/clinics/lookup-user?dni=' + dni,
			{
				token,
				mockFallback: () => null,
			}
		),

	inviteMember: (
		clinicId: string,
		data: { name: string; email: string; dni: string; role: string },
		token?: string
	) =>
		request<any>(`/clinics/${clinicId}/invite`, {
			method: 'POST',
			token,
			clinicId,
			body: data,
		}),

	createClinic: (
		data: { name: string; admin: { name: string; email: string; dni: string } },
		token?: string
	) =>
		request<{ clinicId: string; adminUid: string }>('/clinics', {
			method: 'POST',
			token,
			body: data,
		}),
};
