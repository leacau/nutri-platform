import type { Timestamp } from "firebase-admin/firestore";

export type PatientDoc = {
  clinicId: string;
  assignedProfessionalUids: string[];
  userId: string | null;
  dni: number;
  name: string;
  email: string | null;
  emailLowercase?: string | null;
  phone: string | null;
  healthInsuranceName?: string | null;
  sexo?: "male" | "female" | "other" | null;
  birthDate?: string | null;
  notes?: string | null;
  privateProfessionalNotes?: Record<
    string,
    {
      content: string;
      updatedAt: Timestamp;
      updatedByUid: string;
    }
  >;
  linkedUid: string | null;
  portalAccessEnabled?: boolean;
  medicalRecordAccessEnabled?: boolean;
  status: "active" | "inactive" | "discharged";

  // audit simple
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
