export type PlatformRole = "platform_admin" | null;

export type ClinicMembershipRole = "clinic_admin" | "staff" | "nutri" | "patient";

export type Membership = {
  clinicId: string;
  clinicName: string;
  role: ClinicMembershipRole;
};

export type MeResponse = {
  uid: string;
  email: string | null;
  memberships: Membership[];
  platformRole?: PlatformRole;
};

export type ClinicBranding = {
  logoUrl?: string | null;
  accentColor?: string | null;
};

export type Clinic = {
  id: string;
  name: string;
  branding?: ClinicBranding;
};

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  role: ClinicMembershipRole | "platform_admin";
  status?: "active" | "invited";
};

export type Patient = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  sexo: "male" | "female" | "other";
  birthDate?: string;
  address?: string;
  clinicId: string;
  assignedNutriId?: string;
  linkedUid?: string;
  objective?: {
    objetivoPrincipal?: string;
    objetivoPeso?: string;
    notas?: string;
  };
  measurements?: {
    peso?: number;
    altura?: number;
    grasaCorporal?: number;
    grasaVisceral?: number;
    masaMuscular?: number;
    imc?: number;
  };
  notes?: string;
  attachments?: { id: string; name: string; url: string }[];
};

export type AppointmentStatus = "requested" | "scheduled" | "cancelled" | "completed";

export type Appointment = {
  id: string;
  clinicId: string;
  patientId: string;
  patientUid?: string;
  nutriId: string;
  status: AppointmentStatus;
  requestedAt: string;
  scheduledFor?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  cancelledByUid?: string;
  cancelledByRole?: ClinicMembershipRole | "platform_admin";
};

export type TemplateChannel = "whatsapp" | "email";

export type MessageTemplate = {
  id: string;
  name: string;
  channel: TemplateChannel;
  body: string;
  clinicId: string;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  clinicId: string;
  actor: string;
  actorRole: string;
  type: string;
  createdAt: string;
  detail: string;
};

export type ClinicSettings = {
  branding?: ClinicBranding;
  reminderPreferences?: {
    whatsappEnabled: boolean;
    emailEnabled: boolean;
  };
};
