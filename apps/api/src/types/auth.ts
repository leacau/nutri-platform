export type Role =
	| 'platform_admin'
	| 'clinic_admin'
	| 'nutri'
	| 'staff'
	| 'patient';

export type AuthContext = {
	uid: string;
	email: string | null;

	/**
	 * En Paso 2 NO hacemos enforcement de claims aún.
	 * Esto queda opcional por ahora.
	 * En Paso 3 se vuelve obligatorio para roles del equipo (clinic_admin/nutri/staff).
	 */
	role?: Role;
	clinicId?: string;
};
