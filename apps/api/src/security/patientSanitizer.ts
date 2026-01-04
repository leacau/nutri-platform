import type { PatientDoc } from '../types/patients.js';
import type { Role } from '../types/auth.js';

export type PatientPublic = {
	id: string;
	clinicId: string;
	name: string;
	email: string | null;
	phone: string | null;
	linkedUid: string | null;
	assignedNutriUid: string | null | undefined;
	status?: string | null;
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
	assignedNutriUid: string | null | undefined;
	status?: string | null;
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
			assignedNutriUid: p.assignedNutriUid,
			status: p.status,
		};
	}

	// clinic_admin / nutri / platform_admin: todo
	return {
		id: p.id,
		clinicId: p.clinicId,
		name: p.name,
		email: p.email,
		phone: p.phone,
		linkedUid: p.linkedUid,
		assignedNutriUid: p.assignedNutriUid,
		status: p.status,
		createdAt: p.createdAt,
		updatedAt: p.updatedAt,
	};
}
