export type PlatformRole = "platform_admin" | null;

export type ClinicMembershipRole =
  "clinic_admin" | "staff" | "professional" | "patient";

export type ClinicCapability =
  | "manage_clinic_settings"
  | "manage_clinic_users"
  | "manage_patients"
  | "manage_patient_portal_access"
  | "view_medical_records"
  | "edit_medical_records"
  | "share_medical_records"
  | "assign_any_patient"
  | "view_all_appointments"
  | "manage_templates"
  | "view_audit"
  | "schedule_for_others";

export type Membership = {
  clinicId: string;
  clinicName: string;
  role: ClinicMembershipRole;
  patientId?: string;
  tenantType?: "clinic" | "individual_practice";
  ownerProfessionalUid?: string | null;
  capabilities?: ClinicCapability[];
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
  tenantType?: "clinic" | "individual_practice";
  ownerProfessionalUid?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  isActive?: boolean;
  branding?: ClinicBranding | null;
};

export type UserAccount = {
  id: string;
  name: string;
  email: string;
  role: ClinicMembershipRole | "platform_admin";
  status?: "active" | "inactive" | "invited";
  uid?: string;
  isActive?: boolean;
};

export type Patient = {
  id: string;
  name: string;
  dni?: string | number;
  email?: string;
  phone?: string;
  sexo?: "male" | "female" | "other";
  birthDate?: string;
  privateProfessionalNote?: string;
  address?: string;
  clinicId: string;
  assignedProfessionalUids?: string[];
  linkedUid?: string;
  portalAccessEnabled?: boolean;
  medicalRecordAccessEnabled?: boolean;
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

export type AppointmentStatus =
  "requested" | "scheduled" | "arrived" | "cancelled" | "completed";

export type Appointment = {
  id: string;
  clinicId: string;
  patientId: string;
  patientUid?: string;
  professionalUid: string;
  status: AppointmentStatus;
  requestedAt: string;
  scheduledFor?: string;
  arrivedAt?: string;
  completedAt?: string;
  completedByUid?: string;
  completedByRole?: ClinicMembershipRole | "platform_admin";
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

export type CompliancePolicy = {
  mfaRequiredForAdmins: boolean;
  mfaRequiredForProfessionals: boolean;
  sessionTimeoutMinutes: number;
  clinicalRecordRetentionYears: number;
  backupFrequency: "daily" | "weekly";
  backupRetentionDays: number;
  internationalTransferProvider: string;
  internationalTransferSafeguards: string;
  digitalSignatureMode:
    | "pending_provider"
    | "electronic_signature"
    | "certified_digital_signature";
  privacyPolicyVersion: string;
  termsVersion: string;
  incidentResponseContact: string;
  dataProtectionContact: string;
  updatedAt?: string | null;
  updatedByUid?: string | null;
};

export type ComplianceCheck = {
  id: string;
  label: string;
  status: "configured" | "pending" | "external_required";
  detail: string;
};

export type ComplianceChecklist = {
  policy: CompliancePolicy;
  checks: ComplianceCheck[];
};

export type DataSubjectRequestType =
  | "access"
  | "rectification"
  | "update"
  | "confidentiality"
  | "deletion"
  | "export";

export type DataSubjectRequest = {
  id: string;
  clinicId: string;
  type: DataSubjectRequestType;
  status: "received" | "in_review" | "fulfilled" | "rejected";
  patientId?: string | null;
  subjectUid?: string | null;
  subjectEmail?: string | null;
  description: string;
  resolution?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  dueAt?: string | null;
};

export type BackupEvent = {
  id: string;
  clinicId: string;
  provider: string;
  location?: string | null;
  status: "success" | "failed" | "verified";
  detail: string;
  createdAt?: string | null;
  createdByUid?: string | null;
};

export type ClinicSettings = {
  name?: string;
  branding?: ClinicBranding;
  reminderPreferences?: {
    whatsappEnabled: boolean;
    emailEnabled: boolean;
  };
  patientAppointmentSelfService?: {
    canCancel?: boolean;
    canReschedule?: boolean;
    minHoursBefore?: number;
  };
};

export type TemplateFieldType = "number" | "text" | "select" | "formula";

export type TemplateField = {
  id: string;
  label: string;
  type: TemplateFieldType;
  options?: string[]; // Para selects
  unit?: string; // ej: kg, cm
  required: boolean;
  formula?: string; // ej: {peso} / (({altura}/100) * ({altura}/100))
  decimals?: number;
  standardMapping?: string; // <-- Mapeo al estándar (ej: "bmi", "body_fat")
};

export type MeasurementTemplate = {
  id: string;
  clinicId: string;
  name: string;
  description?: string;
  fields: TemplateField[];
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
};
