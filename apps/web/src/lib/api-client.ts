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
	method?: 'GET' | 'POST' | 'PATCH';
	body?: unknown;
	token?: string;
	clinicId?: string;
	mockFallback?: () => T | Promise<T>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

// Helper para tipar la respuesta del backend { success: boolean, data: T }
type ApiResponse<T> = {
	success: boolean;
	data: T;
	message?: string;
};

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

	const url = `${API_BASE}${path}`;

	try {
		const res = await fetch(url, {
			method: options.method || 'GET',
			headers,
			body: options.body ? JSON.stringify(options.body) : undefined,
		});

		if (res.status === 401) throw new Error('unauthorized');
		if (res.status === 403) throw new Error('forbidden');

		if (!res.ok) {
			if (USE_MOCKS && options.mockFallback)
				return await options.mockFallback();
			const text = await res.text();
			throw new Error(text || 'Request failed');
		}

		const json = await res.json();

		// IMPORTANTE: Desenvolver la respuesta del backend { success: true, data: ... }
		// Si la respuesta tiene propiedad "data", devolvemos eso. Si es un array directo (mocks), lo devolvemos tal cual.
		if (
			json &&
			typeof json === 'object' &&
			'success' in json &&
			'data' in json
		) {
			return json.data as T;
		}

		return json as T;
	} catch (error) {
		if (USE_MOCKS && options.mockFallback) {
			return await options.mockFallback();
		}
		throw error;
	}
}

// ... (El bloque mockDb puede quedar igual para fallbacks) ...
// He recortado el mockDb aquí para brevedad, pero mantenelo en tu archivo.
const mockDb: any = {
	/* ... tu mockDb existente ... */
};

export const apiClient = {
	// CORRECCIÓN: Usar /session y mapear la respuesta a MeResponse
	me: (token?: string) =>
		request<any>('/session', {
			token,
			mockFallback: () => mockDb.me,
		}).then((data) => {
			// Adaptador: Backend /session -> Frontend MeResponse
			// El backend devuelve { uid, email, staffClinics, patientClinics }
			// El frontend espera { uid, email, memberships }
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
						role: 'patient', // Rol implícito para pacientes
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

	// CORRECCIÓN: Usar /clinics/mine y mapear a Clinic[]
	clinics: (token?: string) =>
		request<any>('/clinics/mine', {
			token,
			mockFallback: () => mockDb.clinics,
		}).then((data) => {
			// El endpoint /clinics/mine devuelve { clinics: [...] } dentro de data
			// Ojo: request() ya desenvuelve el primer nivel "data" del { success, data }
			// pero /clinics/mine devuelve { uid, clinics: [] } dentro de ese data.
			const list = data.clinics || [];
			return list.map((c: any) => ({
				id: c.clinicId,
				name: c.clinicName || c.clinicId,
				branding: null, // El endpoint mine no devuelve branding por ahora
			})) as Clinic[];
		}),

	// El resto de los endpoints parecen coincidir con la estructura estándar /api/...
	clinicSettings: (clinicId: string, token?: string) =>
		request<ClinicSettings>(`/clinics/${clinicId}`, {
			// Ojo: backend no tiene GET /clinics/:id simple, puede fallar si no sos admin
			token,
			clinicId,
			mockFallback: () => ({
				branding: { accentColor: '#2F8F7B' },
				reminderPreferences: { whatsappEnabled: true, emailEnabled: true },
			}),
		}),

	// ... resto de métodos (patients, appointments, etc) se mantienen igual ...
	// Solo asegurate de que request() maneja el unwrap de { success: true, data: ... }
	// como puse en la función request arriba.

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

	createPatient: (clinicId: string, data: Partial<Patient>, token?: string) =>
		request<Patient>('/patients', {
			method: 'POST',
			token,
			clinicId,
			body: { ...data }, // Backend no espera clinicId en el body, lo toma del header/context
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
			// Backend espera POST /:id/schedule
			method: 'POST', // Tu backend usa POST para schedule
			token,
			clinicId,
			body,
			mockFallback: () => ({ ...body } as Appointment),
		}),

	// Nota: Para crear un turno nuevo (request), el backend usa /appointments/request
	// Si scheduleAppointment se usa para crear, hay que revisar el componente.
	// El componente AppointmentsPage usa scheduleMutation para CREAR?
	// Backend: POST /request (para paciente) o POST /:id/schedule (para agendar uno existente).

	// IMPORTANTE: Agrego requestAppointment si falta, usado por portal
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
			// Backend no tiene /templates implementado en el código provisto
			token,
			clinicId,
			mockFallback: () => [],
		}),

	audit: (clinicId: string, token?: string) =>
		request<AuditEvent[]>('/audit', {
			// Backend no tiene /audit implementado (logs solo a consola)
			token,
			clinicId,
			mockFallback: () => [],
		}),

	nutris: (clinicId: string, token?: string) =>
		request<UserAccount[]>(`/clinics/${clinicId}/members`, {
			// Backend usa /members
			token,
			clinicId,
			mockFallback: () => [],
		}).then((members: any) => members.filter((m: any) => m.role === 'nutri')),

	staff: (clinicId: string, token?: string) =>
		request<UserAccount[]>(`/clinics/${clinicId}/members`, {
			token,
			clinicId,
			mockFallback: () => [],
		}).then((members: any) => members.filter((m: any) => m.role === 'staff')),
};
