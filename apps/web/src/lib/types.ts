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
  billing?: ClinicBilling;
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

export type BillingPlanKey =
  | "individual"
  | "starter_1_5"
  | "team_6_15"
  | "scale_16_50"
  | "enterprise";

export type BillingStatus =
  | "trial"
  | "active"
  | "past_due"
  | "suspended"
  | "cancelled";

export type BillingModuleKey =
  | "patientPortal"
  | "automatedMessaging"
  | "advancedAudit"
  | "digitalSignature"
  | "customBranding";

export type ClinicEnabledModules = Record<BillingModuleKey, boolean>;

export type ClinicBillingLimits = {
  professionals: number | null;
  staff: number | null;
  activePatients: number | null;
  storageGb: number | null;
};

export type ClinicBilling = {
  plan: BillingPlanKey;
  status: BillingStatus;
  enabledModules: ClinicEnabledModules;
  limits: ClinicBillingLimits;
  updatedAt?: string | null;
  updatedByUid?: string | null;
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
  billing?: ClinicBilling;
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
  healthInsuranceName?: string | null;
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

export type AvailabilityRange = {
  start: string;
  end: string;
};

export type AvailabilityDay = {
  dayOfWeek: number;
  enabled: boolean;
  start?: string;
  end?: string;
  ranges: AvailabilityRange[];
};

export type ProfessionalAvailability = {
  professionalUid: string;
  slotMinutes: number;
  days: AvailabilityDay[];
};

export type AppointmentSlot = {
  time: string;
  startsAt: string;
  available: boolean;
  appointmentId?: string;
};

export type AppointmentSlotsResponse = {
  slotMinutes: number;
  free: AppointmentSlot[];
  busy: AppointmentSlot[];
  slots: AppointmentSlot[];
};

export type AppointmentAvailableDay = {
  date: string;
  freeCount: number;
  firstAvailableTime: string | null;
};

export type AppointmentAvailableDaysResponse = {
  days: AppointmentAvailableDay[];
};

export type FoodLogDayKey =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type FoodLogMealKey =
  | "breakfast"
  | "morningSnack"
  | "lunch"
  | "afternoonSnack"
  | "dinner";

export type FoodLogMealEntry = {
  time: string;
  detail: string;
};

export type FoodLogDays = Record<
  FoodLogDayKey,
  Record<FoodLogMealKey, FoodLogMealEntry>
>;

export type FoodLogNote = {
  id: string;
  scope: "week" | "day" | "meal";
  dayKey?: FoodLogDayKey;
  mealKey?: FoodLogMealKey;
  content: string;
  visibleToPatient: boolean;
  professionalUid: string;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FoodLog = {
  id: string;
  clinicId: string;
  patientId: string;
  weekStart: string;
  days: FoodLogDays;
  sharedWithProfessionalUids: string[];
  professionalNotes?: FoodLogNote[];
  createdAt?: string | null;
  updatedAt?: string | null;
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

export type MeasurementReferenceRange = {
  label?: string;
  sex?: "all" | "male" | "female" | "other";
  ageMin?: number | null;
  ageMax?: number | null;
  min?: number | null;
  max?: number | null;
  referenceValue?: number | null;
};

export type MeasurementStandard = {
  id: string;
  clinicId: string;
  name: string;
  unit?: string;
  category?: string;
  description?: string;
  referenceRanges: MeasurementReferenceRange[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type MeasurementStandardSnapshot = Pick<
  MeasurementStandard,
  "id" | "name" | "unit" | "category" | "referenceRanges"
>;

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
  standardReference?: MeasurementStandardSnapshot;
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
