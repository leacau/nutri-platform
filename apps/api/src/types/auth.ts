export type ClinicRole = 'clinic_admin' | 'nutri' | 'staff';

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
