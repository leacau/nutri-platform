import type { PatientDoc } from '../types/patients.js';
import type { Role } from '../types/auth.js';

export type PatientPublic = {
	id: string;
	clinicId: string;
	name: string;
	email: string | null;
	phone: string | null;
	linkedUid: string | null;
	assignedProfessionalUids: string[] | undefined;
	createdAt: unknown;
	updatedAt: unknown;
};

export type PatientStaffView = {
	id: string;
	clinicId: string;
	name: string;
	email: string | null;
	phone: string | null;
	linkedUid: string | null;
	assignedProfessionalUids: string[] | undefined;
};

export function sanitizePatientForRole(
	role: Role,
	p: PatientDoc & { id: string }
): PatientPublic | PatientStaffView {
	// staff: SOLO contacto. Nada de timestamps (se usan para auditoría interna, no para administrativos).
	if (role === 'staff') {
		return {
			id: p.id,
			clinicId: p.clinicId,
			name: p.name,
			email: p.email,
			phone: p.phone,
			linkedUid: p.linkedUid,
			assignedProfessionalUids: p.assignedProfessionalUids,
		};
	}

	// clinic_admin / professional / platform_admin: todo
	return {
		id: p.id,
		clinicId: p.clinicId,
		name: p.name,
		email: p.email,
		phone: p.phone,
		linkedUid: p.linkedUid,
		assignedProfessionalUids: p.assignedProfessionalUids,
		createdAt: p.createdAt,
		updatedAt: p.updatedAt,
	};
}
