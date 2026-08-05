import {
  Appointment,
  AuditEvent,
  Clinic,
  ClinicSettings,
  MeResponse,
  MeasurementTemplate,
  Membership,
  MessageTemplate,
  Patient,
  QaUsersResponse,
  UserAccount,
} from "./types";

// NUEVO: Tipos para el Historia Clínica
export type ClinicalRecord = {
  id: string;
  clinicId: string;
  patientId: string;
  professionalUid: string;
  visibleInPatientPortal?: boolean;
  type:
    | "note"
    | "measurement"
    | "dynamic_measurement"
    | "prescription"
    | "meal_plan"
    | "attachment";
  date: string;
  data: any;
  createdAt?: string;
};

type RequestOptions<T> = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string;
  clinicId?: string;
  mockFallback?: () => T | Promise<T>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api";
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  console.info("[api-client] API_BASE_URL", API_BASE);
}

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function request<T>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  if (options.clinicId) {
    headers.set("X-Clinic-Id", options.clinicId);
  }

  const url = joinUrl(API_BASE, path);

  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401) throw new ApiError("unauthorized", 401);
    if (res.status === 403) throw new ApiError("forbidden", 403);

    if (!res.ok) {
      if (USE_MOCKS && options.mockFallback) {
        return await options.mockFallback();
      }

      const text = await safeReadText(res);
      throw new ApiError(
        text || `Request failed: ${res.status} ${res.statusText}`,
        res.status,
      );
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await safeReadText(res);
      return text as unknown as T;
    }

    const json = await res.json();

    if (
      json &&
      typeof json === "object" &&
      "success" in json &&
      "data" in json
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
  qaUsers: () => request<QaUsersResponse>("/dev/qa-users"),

  upsertUserProfile: (
    data: { name: string; email?: string; dni?: string },
    token?: string,
  ) =>
    request<{ uid: string }>("/users/self", {
      method: "POST",
      token,
      body: data,
    }),

  me: (token?: string) =>
    request<any>("/session", {
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
          })),
        );
      }

      if (data.patientClinics) {
        memberships.push(
          ...data.patientClinics.map((c: any) => ({
            clinicId: c.clinicId,
            role: "patient",
            patientId: c.patientId,
            clinicName: c.clinicName || "Clínica",
          })),
        );
      }

      return {
        uid: data.uid,
        email: data.email,
        platformRole: data.isPlatformAdmin ? "platform_admin" : null,
        memberships,
      } as MeResponse;
    }),

  clinics: (token?: string) =>
    request<any>("/clinics/mine", {
      token,
      mockFallback: () => mockDb.clinics,
    }).then((data) => {
      const list = data.clinics || [];
      return list.map((c: any) => ({
        id: c.clinicId,
        name: c.clinicName || c.clinicId,
        role: c.role,
        patientId: c.patientId,
        branding: null,
      })) as Clinic[];
    }),

  adminClinics: (token?: string) =>
    request<Clinic[]>("/admin/clinics", {
      token,
      mockFallback: () => mockDb.clinics,
    }),

  updateClinic: (
    clinicId: string,
    data: { name?: string; isActive?: boolean },
    token?: string,
  ) =>
    request<Clinic>(`/admin/clinics/${clinicId}`, {
      method: "PATCH",
      token,
      body: data,
    }),

  deleteClinic: (clinicId: string, token?: string) =>
    request<{ id: string; deleted: Record<string, number> }>(
      `/admin/clinics/${clinicId}`,
      {
        method: "DELETE",
        token,
      },
    ),

  adminClinicMembers: (clinicId: string, token?: string) =>
    request<UserAccount[]>(`/admin/clinics/${clinicId}/members`, {
      token,
    }),

  addAdminClinicMember: (
    clinicId: string,
    data: {
      uid: string;
      role: "clinic_admin" | "professional" | "staff";
      isActive?: boolean;
    },
    token?: string,
  ) =>
    request<UserAccount>(`/admin/clinics/${clinicId}/members`, {
      method: "POST",
      token,
      body: data,
    }),

  updateAdminClinicMember: (
    clinicId: string,
    membershipId: string,
    data: {
      role?: "clinic_admin" | "professional" | "staff";
      isActive?: boolean;
    },
    token?: string,
  ) =>
    request<UserAccount>(`/admin/clinics/${clinicId}/members/${membershipId}`, {
      method: "PATCH",
      token,
      body: data,
    }),

  deleteAdminClinicMember: (
    clinicId: string,
    membershipId: string,
    token?: string,
  ) =>
    request<{ id: string }>(
      `/admin/clinics/${clinicId}/members/${membershipId}`,
      {
        method: "DELETE",
        token,
      },
    ),

  clinic: (clinicId: string, token?: string) =>
    request<Clinic>(`/clinics/${clinicId}`, {
      token,
      mockFallback: () => ({
        id: clinicId,
        name: clinicId,
        branding: null,
      }),
    }),

  clinicSettings: (clinicId: string, token?: string) =>
    request<ClinicSettings>(`/clinics/${clinicId}`, {
      token,
      clinicId,
      mockFallback: () => ({
        branding: { accentColor: "#2F8F7B" },
        reminderPreferences: { whatsappEnabled: true, emailEnabled: true },
      }),
    }),

  saveClinicSettings: (
    clinicId: string,
    settings: Partial<ClinicSettings>,
    token?: string,
  ) =>
    request<ClinicSettings>(`/clinics/${clinicId}/settings`, {
      method: "PATCH",
      body: settings,
      token,
      clinicId,
      mockFallback: () => settings as ClinicSettings,
    }),

  patients: (clinicId: string, token?: string) =>
    request<Patient[]>("/patients", {
      token,
      clinicId,
      mockFallback: () => [],
    }),

  patient: (id: string, clinicId: string, token?: string) =>
    request<Patient>(`/patients/${id}`, {
      token,
      clinicId,
      mockFallback: () => {
        throw new Error("Mock patient not found");
      },
    }),

  lookupPatient: (dni: string, clinicId: string, token?: string) =>
    request<{
      id: string;
      name: string;
      email?: string | null;
      phone?: string | null;
      sexo?: "male" | "female" | "other" | null;
      birthDate?: string | null;
      clinicId: string;
      assignedProfessionalUids?: string[];
    } | null>(`/patients/lookup?dni=${dni}&clinicId=${clinicId}`, {
      token,
      clinicId,
      mockFallback: () => null,
    }),

  createPatient: (clinicId: string, data: Partial<Patient>, token?: string) =>
    request<Patient>("/patients", {
      method: "POST",
      token,
      clinicId,
      body: { ...data },
      mockFallback: () => ({ id: "mock-id", ...data }) as Patient,
    }),

  updatePatient: (
    id: string,
    clinicId: string,
    data: Partial<Patient>,
    token?: string,
  ) =>
    request<Patient>(`/patients/${id}`, {
      method: "PATCH",
      token,
      clinicId,
      body: data,
    }),

  appointments: (clinicId: string, token?: string) =>
    request<Appointment[]>("/appointments", {
      token,
      clinicId,
      mockFallback: () => [],
    }),

  createAppointment: (
    body: Partial<Appointment>,
    clinicId: string,
    token?: string,
  ) =>
    request<Appointment>("/appointments", {
      method: "POST",
      token,
      clinicId,
      body,
      mockFallback: () =>
        ({ ...body, id: "mock-id", status: "scheduled" }) as Appointment,
    }),

  scheduleAppointment: (
    body: Partial<Appointment>,
    clinicId: string,
    token?: string,
  ) =>
    request<Appointment>(`/appointments/${body.id || "new"}/schedule`, {
      method: "POST",
      token,
      clinicId,
      body,
      mockFallback: () => ({ ...body }) as Appointment,
    }),

  updateAppointment: (
    id: string,
    clinicId: string,
    data: Partial<Appointment>,
    token?: string,
  ) =>
    request<Appointment>(`/appointments/${id}`, {
      method: "PATCH",
      token,
      clinicId,
      body: data,
    }),

  requestAppointment: (body: any, clinicId: string, token?: string) =>
    request<Appointment>("/appointments/request", {
      method: "POST",
      token,
      clinicId,
      body,
    }),

  arriveAppointment: (id: string, clinicId: string, token?: string) =>
    request<Appointment>(`/appointments/${id}/arrive`, {
      method: "POST",
      token,
      clinicId,
    }),

  completeAppointment: (id: string, clinicId: string, token?: string) =>
    request<Appointment>(`/appointments/${id}/complete`, {
      method: "POST",
      token,
      clinicId,
    }),

  cancelAppointment: (id: string, clinicId: string, token?: string) =>
    request<Appointment>(`/appointments/${id}/cancel`, {
      method: "POST",
      token,
      clinicId,
      mockFallback: () => ({ id, status: "cancelled" }) as any,
    }),

  templates: (clinicId: string, token?: string) =>
    request<MessageTemplate[]>("/templates", {
      token,
      clinicId,
      mockFallback: () => [],
    }),

  // PLANTILLAS (TEMPLATES)
  getTemplates: (clinicId: string, token?: string) =>
    request<MeasurementTemplate[]>("/measurement-templates", {
      token,
      clinicId,
    }),

  createTemplate: (
    data: { name: string; description?: string; fields: any[] },
    clinicId: string,
    token?: string,
  ) =>
    request<{ success: boolean; data: MeasurementTemplate }>(
      "/measurement-templates",
      {
        method: "POST",
        body: data,
        token,
        clinicId,
      },
    ),

  updateTemplate: (
    id: string,
    data: { name: string; description?: string; fields: any[] },
    clinicId: string,
    token?: string,
  ) =>
    request<{ success: boolean; data: MeasurementTemplate }>(
      `/measurement-templates/${id}`,
      {
        method: "PATCH",
        body: data,
        token,
        clinicId,
      },
    ),

  deleteTemplate: (id: string, clinicId: string, token?: string) =>
    request<{ success: boolean }>(`/measurement-templates/${id}`, {
      method: "DELETE",
      token,
      clinicId,
    }),

  audit: (clinicId: string, token?: string) =>
    request<AuditEvent[]>("/audit", {
      token,
      clinicId,
      mockFallback: () => [],
    }),

  professionals: (clinicId: string, token?: string) =>
    request<UserAccount[]>(`/clinics/${clinicId}/professionals`, {
      token,
      clinicId,
      mockFallback: () => [],
    }),

  staff: (clinicId: string, token?: string) =>
    request<UserAccount[]>(`/clinics/${clinicId}/members`, {
      token,
      clinicId,
      mockFallback: () => [],
    }).then((members: any) => members.filter((m: any) => m.role === "staff")),

  lookupUser: (dni: string, token?: string) =>
    request<{ uid: string; name: string; email: string } | null>(
      "/clinics/lookup-user?dni=" + dni,
      {
        token,
        mockFallback: () => null,
      },
    ),

  inviteMember: (
    clinicId: string,
    data: { name: string; email: string; dni: string; role: string },
    token?: string,
  ) =>
    request<any>(`/clinics/${clinicId}/invite`, {
      method: "POST",
      token,
      clinicId,
      body: data,
    }),

  createClinic: (
    data: { name: string; admin: { name: string; email: string; dni: string } },
    token?: string,
  ) =>
    request<Clinic & { clinicId?: string; adminUid: string }>(
      "/admin/clinics",
      {
        method: "POST",
        token,
        body: data,
      },
    ),

  // NUEVO: Funciones para Registros Clínicos
  getClinicalRecords: (patientId: string, clinicId: string, token?: string) =>
    request<ClinicalRecord[]>(`/clinical-records/patient/${patientId}`, {
      token,
      clinicId,
      mockFallback: () => [],
    }),

  updatePatientProfessionalNote: (
    patientId: string,
    clinicId: string,
    content: string,
    token?: string,
  ) =>
    request<{ patientId: string; privateProfessionalNote: string }>(
      `/patients/${patientId}/professional-note`,
      {
        method: "PATCH",
        token,
        clinicId,
        body: { content },
      },
    ),

  createClinicalRecord: (
    data: Omit<ClinicalRecord, "id" | "createdAt">,
    clinicId: string,
    token?: string,
  ) =>
    request<ClinicalRecord>("/clinical-records", {
      method: "POST",
      token,
      clinicId,
      body: data,
    }),

  deleteClinicalRecord: (recordId: string, clinicId: string, token?: string) =>
    request<{ success: boolean }>(`/clinical-records/${recordId}`, {
      method: "DELETE",
      token,
      clinicId,
    }),

  updateClinicalRecord: (
    recordId: string,
    data: { date?: string; data?: any; visibleInPatientPortal?: boolean },
    clinicId: string,
    token?: string,
  ) =>
    request<ClinicalRecord>(`/clinical-records/${recordId}`, {
      method: "PATCH",
      token,
      clinicId,
      body: data,
    }),
};
