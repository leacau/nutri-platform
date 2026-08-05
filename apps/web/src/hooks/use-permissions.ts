'use client';

import { ClinicMembershipRole } from '../lib/types';
import { useClinic } from '../providers/clinic-provider';
import { useMemo } from 'react';

export type PermissionSet = {
	canViewSettings: boolean;
	canManageClinicUsers: boolean;
	canManagePatients: boolean;
	canManagePatientPortalAccess: boolean;
	canViewMedicalRecords: boolean;
	canEditMedicalRecords: boolean;
	canShareMedicalRecords: boolean;
	canAssignAnyPatient: boolean;
	canSeeAllAppointments: boolean;
	canManageTemplates: boolean;
	canViewAudit: boolean;
	canScheduleForOthers: boolean;
};

const defaultPermissions: PermissionSet = {
	canViewSettings: false,
	canManageClinicUsers: false,
	canManagePatients: false,
	canManagePatientPortalAccess: false,
	canViewMedicalRecords: false,
	canEditMedicalRecords: false,
	canShareMedicalRecords: false,
	canAssignAnyPatient: false,
	canSeeAllAppointments: false,
	canManageTemplates: false,
	canViewAudit: false,
	canScheduleForOthers: false,
};

const platformAdminPermissions: PermissionSet = {
	canViewSettings: true,
	canManageClinicUsers: true,
	canManagePatients: true,
	canManagePatientPortalAccess: true,
	canViewMedicalRecords: false,
	canEditMedicalRecords: false,
	canShareMedicalRecords: false,
	canAssignAnyPatient: true,
	canSeeAllAppointments: true,
	canManageTemplates: true,
	canViewAudit: true,
	canScheduleForOthers: true,
};

const permsByRole: Record<ClinicMembershipRole, PermissionSet> = {
	clinic_admin: {
		canViewSettings: true,
		canManageClinicUsers: true,
		canManagePatients: true,
		canManagePatientPortalAccess: true,
		canViewMedicalRecords: false,
		canEditMedicalRecords: false,
		canShareMedicalRecords: false,
		canAssignAnyPatient: true,
		canSeeAllAppointments: true,
		canManageTemplates: true,
		canViewAudit: true,
		canScheduleForOthers: true,
	},
	staff: {
		canViewSettings: false,
		canManageClinicUsers: true,
		canManagePatients: true,
		canManagePatientPortalAccess: true,
		canViewMedicalRecords: false,
		canEditMedicalRecords: false,
		canShareMedicalRecords: false,
		canAssignAnyPatient: true,
		canSeeAllAppointments: true,
		canManageTemplates: true,
		canViewAudit: false,
		canScheduleForOthers: true,
	},
	professional: {
		canViewSettings: false,
		canManageClinicUsers: false,
		canManagePatients: true,
		canManagePatientPortalAccess: false,
		canViewMedicalRecords: true,
		canEditMedicalRecords: true,
		canShareMedicalRecords: true,
		canAssignAnyPatient: false,
		canSeeAllAppointments: false,
		canManageTemplates: true,
		canViewAudit: false,
		canScheduleForOthers: false,
	},
	patient: {
		canViewSettings: false,
		canManageClinicUsers: false,
		canManagePatients: false,
		canManagePatientPortalAccess: false,
		canViewMedicalRecords: false,
		canEditMedicalRecords: false,
		canShareMedicalRecords: false,
		canAssignAnyPatient: false,
		canSeeAllAppointments: false,
		canManageTemplates: false,
		canViewAudit: false,
		canScheduleForOthers: false,
	},
};

export function usePermissions(): PermissionSet {
	const { activeMembership, platformRole } = useClinic();

	return useMemo(() => {
		// Platform admin: override total
		if (platformRole === 'platform_admin') return platformAdminPermissions;

		// Si todavía no hay clínica activa, no hay permisos
		const role = activeMembership?.role;
		if (!role) return defaultPermissions;

		return permsByRole[role] ?? defaultPermissions;
	}, [activeMembership, platformRole]);
}
