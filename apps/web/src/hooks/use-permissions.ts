"use client";

import { useMemo } from "react";
import { useClinic } from "../providers/clinic-provider";
import { ClinicMembershipRole } from "../lib/types";

export type PermissionSet = {
  canViewSettings: boolean;
  canManageClinicUsers: boolean;
  canManagePatients: boolean;
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
  canAssignAnyPatient: false,
  canSeeAllAppointments: false,
  canManageTemplates: false,
  canViewAudit: false,
  canScheduleForOthers: false,
};

const permsByRole: Record<ClinicMembershipRole, PermissionSet> = {
  clinic_admin: {
    canViewSettings: true,
    canManageClinicUsers: true,
    canManagePatients: true,
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
    if (!activeMembership) return defaultPermissions;
    if (platformRole === "platform_admin") {
      return {
        canViewSettings: true,
        canManageClinicUsers: true,
        canManagePatients: true,
        canAssignAnyPatient: true,
        canSeeAllAppointments: true,
        canManageTemplates: true,
        canViewAudit: true,
        canScheduleForOthers: true,
      };
    }
    return permsByRole[activeMembership.role] ?? defaultPermissions;
  }, [activeMembership, platformRole]);
}
