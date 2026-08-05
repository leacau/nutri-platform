import type { ClinicRole } from '../types/auth.js';

const roleRank: Record<ClinicRole, number> = {
	clinic_admin: 3,
	staff: 2,
	professional: 1,
};

export function isClinicRole(role: unknown): role is ClinicRole {
	return role === 'clinic_admin' || role === 'staff' || role === 'professional';
}

export function compareClinicRoles(a: ClinicRole, b: ClinicRole) {
	return roleRank[a] - roleRank[b];
}

export function pickHighestClinicRole(
	roles: Array<ClinicRole | string | null | undefined>,
): ClinicRole | null {
	return roles.reduce<ClinicRole | null>((best, role) => {
		if (!isClinicRole(role)) return best;
		if (!best || compareClinicRoles(role, best) > 0) return role;
		return best;
	}, null);
}
