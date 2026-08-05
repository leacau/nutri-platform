import type { ClinicCapability, ClinicRole } from '../types/auth.js';
import type { ClinicMembershipDoc } from '../types/clinics.js';

export const roleCapabilities: Record<ClinicRole, ClinicCapability[]> = {
	clinic_admin: [
		'manage_clinic_settings',
		'manage_clinic_users',
		'manage_patients',
		'manage_patient_portal_access',
		'assign_any_patient',
		'view_all_appointments',
		'manage_templates',
		'view_audit',
		'schedule_for_others',
	],
	staff: [
		'manage_clinic_users',
		'manage_patients',
		'manage_patient_portal_access',
		'assign_any_patient',
		'view_all_appointments',
		'manage_templates',
		'schedule_for_others',
	],
	professional: [
		'manage_patients',
		'view_medical_records',
		'edit_medical_records',
		'share_medical_records',
		'manage_templates',
	],
};

export function defaultCapabilitiesForRole(role: ClinicRole): ClinicCapability[] {
	return roleCapabilities[role] ?? [];
}

export function capabilitiesForMembership(
	membership: Pick<ClinicMembershipDoc, 'role' | 'capabilities'>,
): ClinicCapability[] {
	return Array.from(
		new Set([
			...defaultCapabilitiesForRole(membership.role),
			...(membership.capabilities ?? []),
		]),
	);
}

export function mergeMembershipCapabilities(
	memberships: Array<Pick<ClinicMembershipDoc, 'role' | 'capabilities'>>,
): ClinicCapability[] {
	return Array.from(
		new Set(memberships.flatMap((membership) => capabilitiesForMembership(membership))),
	);
}
