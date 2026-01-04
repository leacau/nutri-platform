import type { AuthedFetchResult } from '../types/app';

type StubPatient = {
	id: string;
	name: string;
	email: string | null;
	phone: string | null;
	clinicId: string | null;
	assignedNutriUid?: string;
	linkedUid?: string;
};

type StubAppointment = {
	id: string;
	status: 'requested' | 'scheduled' | 'completed' | 'cancelled';
	clinicId: string;
	nutriUid: string;
	patientId: string;
	patientUid?: string;
	patientName?: string;
	requestedAt: string;
	scheduledFor?: string;
	updatedAt?: string;
};

function ok(data: unknown, status = 200): AuthedFetchResult {
	return { ok: true, status, data, attempts: 1, durationMs: 0 };
}

function err(status: number, message: string): AuthedFetchResult {
	return { ok: false, status, data: null, error: message, attempts: 1, durationMs: 0 };
}

function isoIn(hoursAhead: number) {
	return new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString();
}

export function createE2EStubApi() {
	let patientCounter = 1;
	let appointmentCounter = 1;
	const slots = [isoIn(1), isoIn(2), isoIn(3)];

	const patients: StubPatient[] = [
		{
			id: 'seed-patient',
			name: 'Paciente Demo',
			email: 'paciente.demo@example.com',
			phone: '+5491100000000',
			clinicId: 'demo-clinic',
			assignedNutriUid: 'nutri-demo-1',
			linkedUid: 'seed-user',
		},
	];

	const appointments: StubAppointment[] = [
		{
			id: 'seed-appointment',
			status: 'requested',
			clinicId: 'demo-clinic',
			nutriUid: 'nutri-demo-1',
			patientId: 'seed-patient',
			patientUid: 'seed-user',
			patientName: 'Paciente Demo',
			requestedAt: new Date().toISOString(),
		},
	];

	return {
		handle(method: 'GET' | 'POST' | 'PATCH', endpoint: string, body?: unknown): AuthedFetchResult {
			if (endpoint === '/users/me') {
				return ok({
					data: {
						uid: 'e2e-user',
						role: 'clinic_admin',
						clinicId: 'demo-clinic',
					},
				});
			}

			if (endpoint === '/patients' && method === 'GET') {
				return ok({ data: patients });
			}

			if (endpoint === '/patients' && method === 'POST') {
				const payload = (body ?? {}) as Partial<StubPatient>;
				const newPatient: StubPatient = {
					id: `patient-${patientCounter++}`,
					name: payload.name ?? 'Paciente sin nombre',
					email: payload.email ?? null,
					phone: payload.phone ?? null,
					clinicId: payload.clinicId ?? 'demo-clinic',
					assignedNutriUid: payload.assignedNutriUid,
					linkedUid: payload.linkedUid,
				};
				patients.push(newPatient);
				return ok({ data: newPatient }, 201);
			}

			if (endpoint.startsWith('/patients/') && method === 'PATCH') {
				const [, , targetId, action] = endpoint.split('/');
				const patient = patients.find((p) => p.id === targetId);
				if (!patient) return err(404, 'Paciente no encontrado');
				const payload = (body ?? {}) as Partial<StubPatient>;
				if (action === 'link') {
					patient.linkedUid = payload.linkedUid ?? patient.linkedUid;
				} else if (payload.assignedNutriUid) {
					patient.assignedNutriUid = payload.assignedNutriUid;
				}
				return ok({ data: patient });
			}

			if (endpoint === '/appointments' && method === 'GET') {
				return ok({ data: appointments });
			}

			if (endpoint.startsWith('/appointments/slots') && method === 'GET') {
				return ok({ data: { free: slots, busy: [] } });
			}

			if (endpoint === '/appointments/request' && method === 'POST') {
				const payload = (body ?? {}) as Partial<StubAppointment> & { scheduledForIso?: string };
				const newAppointment: StubAppointment = {
					id: `appt-${appointmentCounter++}`,
					status: 'requested',
					clinicId: payload.clinicId ?? 'demo-clinic',
					nutriUid: payload.nutriUid ?? 'nutri-demo-1',
					patientId: payload.patientId ?? 'seed-patient',
					patientUid: payload.patientUid ?? 'seed-user',
					patientName: payload.patientName ?? 'Paciente Demo',
					requestedAt: new Date().toISOString(),
					scheduledFor: payload.scheduledForIso,
				};
				appointments.unshift(newAppointment);
				return ok({ data: newAppointment }, 201);
			}

			if (endpoint.startsWith('/appointments/') && method === 'POST') {
				const [, , apptId, action] = endpoint.split('/');
				const appointment = appointments.find((a) => a.id === apptId);
				if (!appointment) return err(404, 'Turno no encontrado');
				if (action === 'schedule') {
					const payload = body as { scheduledForIso?: string; nutriUid?: string };
					appointment.status = 'scheduled';
					appointment.scheduledFor = payload?.scheduledForIso ?? appointment.scheduledFor ?? slots[0];
					appointment.nutriUid = payload?.nutriUid ?? appointment.nutriUid;
				} else if (action === 'cancel') {
					appointment.status = 'cancelled';
				} else if (action === 'complete') {
					appointment.status = 'completed';
				}
				appointment.updatedAt = new Date().toISOString();
				return ok({ data: appointment });
			}

			return err(404, 'Ruta mock no encontrada');
		},
	};
}
