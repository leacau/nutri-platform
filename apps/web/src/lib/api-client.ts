import { Clinic, ClinicSettings, MeResponse, Patient, Appointment, MessageTemplate, AuditEvent, UserAccount } from "./types";

type RequestOptions<T> = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  token?: string;
  clinicId?: string;
  mockFallback?: () => T | Promise<T>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

async function request<T>(path: string, options: RequestOptions<T> = {}): Promise<T> {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  if (options.clinicId) {
    headers.set("X-Clinic-Id", options.clinicId);
  }

  const url = `${API_BASE}${path}`;

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401) {
      throw new Error("unauthorized");
    }

    if (res.status === 403) {
      throw new Error("forbidden");
    }

    if (!res.ok) {
      if (USE_MOCKS && options.mockFallback) {
        return await options.mockFallback();
      }
      const text = await res.text();
      throw new Error(text || "Request failed");
    }

    const text = await res.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  } catch (error) {
    if (USE_MOCKS && options.mockFallback) {
      return await options.mockFallback();
    }
    throw error;
  }
}

const mockDb = {
  me: {
    uid: "demo-user",
    email: "demo@amsa.core",
    memberships: [
      { clinicId: "clinic_demo_1", clinicName: "Clínica Demo 1", role: "clinic_admin" },
      { clinicId: "clinic_demo_2", clinicName: "Wellness Hub", role: "nutri" },
      { clinicId: "clinic_demo_patient", clinicName: "Paciente Club", role: "patient" },
    ],
    platformRole: "platform_admin" as const,
  },
  clinics: [
    {
      id: "clinic_demo_1",
      name: "Clínica Demo 1",
      branding: { logoUrl: null, accentColor: "#2F8F7B" },
    },
    {
      id: "clinic_demo_2",
      name: "Wellness Hub",
      branding: { logoUrl: null, accentColor: "#1F6FE5" },
    },
    {
      id: "clinic_demo_patient",
      name: "Paciente Club",
      branding: { logoUrl: null, accentColor: "#0F2A44" },
    },
  ] as Clinic[],
  patients: [
    {
      id: "patient_1",
      name: "María González",
      email: "maria@example.com",
      phone: "+54 9 11 5555-1111",
      sexo: "female",
      birthDate: "1990-05-10",
      clinicId: "clinic_demo_1",
      assignedNutriId: "nutri_1",
      linkedUid: "patient-demo",
      measurements: { peso: 68, altura: 165, imc: 24.9, grasaCorporal: 22 },
      objective: { objetivoPrincipal: "Mejorar energía", objetivoPeso: "65 kg" },
      notes: "Prefiere citas por la tarde",
    },
    {
      id: "patient_2",
      name: "Juan Pérez",
      email: "juan@example.com",
      phone: "+54 9 11 5555-2222",
      sexo: "male",
      birthDate: "1988-10-02",
      clinicId: "clinic_demo_1",
      assignedNutriId: "nutri_2",
      measurements: { peso: 82, altura: 172, imc: 27.7 },
      objective: { objetivoPrincipal: "Bajar grasa visceral" },
    },
  ] as Patient[],
  appointments: [
    {
      id: "appt_1",
      clinicId: "clinic_demo_1",
      patientId: "patient_1",
      nutriId: "nutri_1",
      status: "scheduled",
      requestedAt: new Date().toISOString(),
      scheduledFor: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "appt_2",
      clinicId: "clinic_demo_1",
      patientId: "patient_2",
      nutriId: "nutri_2",
      status: "requested",
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ] as Appointment[],
  templates: [
    {
      id: "tpl_1",
      name: "Recordatorio de turno",
      channel: "whatsapp",
      body: "Hola {{patientName}}, te esperamos el {{date}} con {{nutriName}}.",
      clinicId: "clinic_demo_1",
      createdAt: new Date().toISOString(),
    },
    {
      id: "tpl_2",
      name: "Plan inicial",
      channel: "email",
      body: "Adjuntamos tu plan inicial. ¡Gracias por confiar en AMSA Core!",
      clinicId: "clinic_demo_1",
      createdAt: new Date().toISOString(),
    },
  ] as MessageTemplate[],
  audit: [
    {
      id: "audit_1",
      clinicId: "clinic_demo_1",
      actor: "clinic-admin@test.com",
      actorRole: "clinic_admin",
      type: "patient.created",
      createdAt: new Date().toISOString(),
      detail: "Creó paciente María González",
    },
  ] as AuditEvent[],
  staff: [
    { id: "nutri_1", name: "Dra. Ana Ruiz", email: "ana@demo.com", role: "nutri" },
    { id: "nutri_2", name: "Lic. Pablo Díaz", email: "pablo@demo.com", role: "nutri" },
    { id: "staff_1", name: "Camila Staff", email: "camila@demo.com", role: "staff" },
  ] as UserAccount[],
};

export const apiClient = {
  me: (token?: string) =>
    request<MeResponse>("/users/me", {
      token,
      mockFallback: () => mockDb.me,
    }),
  clinics: (token?: string) =>
    request<Clinic[]>("/clinics", {
      token,
      mockFallback: () => mockDb.clinics,
    }),
  clinicSettings: (clinicId: string, token?: string) =>
    request<ClinicSettings>(`/clinics/${clinicId}`, {
      token,
      clinicId,
      mockFallback: () => ({
        branding: mockDb.clinics.find((c) => c.id === clinicId)?.branding,
        reminderPreferences: { whatsappEnabled: true, emailEnabled: true },
      }),
    }),
  saveClinicSettings: (clinicId: string, settings: Partial<ClinicSettings>, token?: string) =>
    request<ClinicSettings>(`/clinics/${clinicId}/settings`, {
      method: "PATCH",
      body: settings,
      token,
      clinicId,
      mockFallback: () => ({
        ...settings,
      }) as ClinicSettings,
    }),
  patients: (clinicId: string, token?: string) =>
    request<Patient[]>("/patients", {
      token,
      clinicId,
      mockFallback: () => mockDb.patients.filter((p) => p.clinicId === clinicId),
    }),
  patient: (id: string, clinicId: string, token?: string) =>
    request<Patient>(`/patients/${id}`, {
      token,
      clinicId,
      mockFallback: () => {
        const patient = mockDb.patients.find((p) => p.id === id && p.clinicId === clinicId);
        if (!patient) {
          throw new Error("Paciente no encontrado");
        }
        return patient;
      },
    }),
  createPatient: (clinicId: string, data: Partial<Patient>, token?: string) =>
    request<Patient>("/patients", {
      method: "POST",
      token,
      clinicId,
      body: { ...data, clinicId },
      mockFallback: () => {
        const newPatient: Patient = {
          id: `patient_${mockDb.patients.length + 1}`,
          name: data.name || "Nuevo paciente",
          sexo: (data.sexo as Patient["sexo"]) || "other",
          clinicId,
          assignedNutriId: data.assignedNutriId,
          email: data.email,
          phone: data.phone,
          birthDate: data.birthDate,
          measurements: data.measurements,
          objective: data.objective,
        };
        mockDb.patients.push(newPatient);
        return newPatient;
      },
    }),
  appointments: (clinicId: string, token?: string) =>
    request<Appointment[]>("/appointments", {
      token,
      clinicId,
      mockFallback: () => mockDb.appointments.filter((appt) => appt.clinicId === clinicId),
    }),
  scheduleAppointment: (body: Partial<Appointment>, clinicId: string, token?: string) =>
    request<Appointment>("/appointments/schedule", {
      method: "POST",
      token,
      clinicId,
      body,
      mockFallback: () => {
        const appt: Appointment = {
          id: `appt_${mockDb.appointments.length + 1}`,
          clinicId,
          patientId: body.patientId || "",
          nutriId: body.nutriId || "",
          status: "scheduled",
          requestedAt: body.requestedAt || new Date().toISOString(),
          scheduledFor: body.scheduledFor,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        mockDb.appointments.push(appt);
        return appt;
      },
    }),
  cancelAppointment: (id: string, clinicId: string, token?: string) =>
    request<Appointment>(`/appointments/${id}/cancel`, {
      method: "POST",
      token,
      clinicId,
      mockFallback: () => {
        const appt = mockDb.appointments.find((a) => a.id === id);
        if (!appt) {
          throw new Error("Turno no encontrado");
        }
        appt.status = "cancelled";
        appt.cancelledAt = new Date().toISOString();
        return appt;
      },
    }),
  templates: (clinicId: string, token?: string) =>
    request<MessageTemplate[]>("/templates", {
      token,
      clinicId,
      mockFallback: () => mockDb.templates.filter((tpl) => tpl.clinicId === clinicId),
    }),
  audit: (clinicId: string, token?: string) =>
    request<AuditEvent[]>("/audit", {
      token,
      clinicId,
      mockFallback: () => mockDb.audit.filter((evt) => evt.clinicId === clinicId),
    }),
  nutris: (clinicId: string, token?: string) =>
    request<UserAccount[]>(`/clinics/${clinicId}/nutris`, {
      token,
      clinicId,
      mockFallback: () => mockDb.staff.filter((member) => member.role === "nutri"),
    }),
  staff: (clinicId: string, token?: string) =>
    request<UserAccount[]>(`/clinics/${clinicId}/staff`, {
      token,
      clinicId,
      mockFallback: () => mockDb.staff.filter((member) => member.role === "staff"),
    }),
};
