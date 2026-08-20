import type { PatientDoc } from "../types/patients.js";
import type { Role } from "../types/auth.js";

export type PatientPublic = {
  id: string;
  clinicId: string;
  name: string;
  email: string | null;
  phone: string | null;
  healthInsuranceName?: string | null;
  dni?: number;
  sexo?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  linkedUid: string | null;
  assignedProfessionalUids: string[] | undefined;
  portalAccessEnabled: boolean;
  medicalRecordAccessEnabled: boolean;
  createdAt: unknown;
  updatedAt: unknown;
};

export type PatientStaffView = {
  id: string;
  clinicId: string;
  name: string;
  email: string | null;
  phone: string | null;
  healthInsuranceName?: string | null;
  dni?: number;
  sexo?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  linkedUid: string | null;
  assignedProfessionalUids: string[] | undefined;
  portalAccessEnabled: boolean;
  medicalRecordAccessEnabled: boolean;
};

export function sanitizePatientForRole(
  role: Role,
  p: PatientDoc & { id: string },
): PatientPublic | PatientStaffView {
  // staff: SOLO contacto. Nada de timestamps (se usan para auditoría interna, no para administrativos).
  if (role === "staff") {
    return {
      id: p.id,
      clinicId: p.clinicId,
      name: p.name,
      email: p.email,
      phone: p.phone,
      healthInsuranceName: p.healthInsuranceName ?? null,
      dni: p.dni,
      sexo: p.sexo ?? null,
      birthDate: p.birthDate ?? null,
      notes: p.notes ?? null,
      linkedUid: p.linkedUid,
      assignedProfessionalUids: p.assignedProfessionalUids,
      portalAccessEnabled: p.portalAccessEnabled !== false,
      medicalRecordAccessEnabled: p.medicalRecordAccessEnabled === true,
    };
  }

  // clinic_admin / professional / platform_admin: todo
  return {
    id: p.id,
    clinicId: p.clinicId,
    name: p.name,
    email: p.email,
    phone: p.phone,
    healthInsuranceName: p.healthInsuranceName ?? null,
    dni: p.dni,
    sexo: p.sexo ?? null,
    birthDate: p.birthDate ?? null,
    notes: p.notes ?? null,
    linkedUid: p.linkedUid,
    assignedProfessionalUids: p.assignedProfessionalUids,
    portalAccessEnabled: p.portalAccessEnabled !== false,
    medicalRecordAccessEnabled: p.medicalRecordAccessEnabled === true,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
