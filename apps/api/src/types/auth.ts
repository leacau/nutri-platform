export type ClinicRole = 'clinic_admin' | 'professional' | 'staff';

export type ClinicCapability =
	| 'manage_clinic_settings'
	| 'manage_clinic_users'
	| 'manage_patients'
	| 'manage_patient_portal_access'
	| 'view_medical_records'
	| 'edit_medical_records'
	| 'share_medical_records'
	| 'assign_any_patient'
	| 'view_all_appointments'
	| 'manage_templates'
	| 'view_audit'
	| 'schedule_for_others';

// Agregamos rol del portal
export type PortalRole = 'patient';

// Actualizamos la unión de roles para incluir PortalRole
export type Role = ClinicRole | PortalRole | 'platform_admin';

export type AuthContext = {
	uid: string;
	email: string | null;
	isPlatformAdmin: boolean;

	role: Role | null;
	clinicId: string | null;
	clinicCapabilities?: ClinicCapability[];
};

export type PatientContext = {
	patientId: string;
	clinicId: string;
};

export type AuthenticatedUser = {
	uid: string;
	email: string | null;
	claims: Record<string, unknown>;
};
