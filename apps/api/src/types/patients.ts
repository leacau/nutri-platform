import type { Timestamp } from 'firebase-admin/firestore';

export type PatientDoc = {
	clinicId: string;
	assignedNutriUid: string | null;
	name: string;
	email: string | null;
	phone: string | null;
	linkedUid: string | null;
	status: 'active' | 'inactive' | 'discharged';

	// audit simple
	createdAt: Timestamp;
	updatedAt: Timestamp;
};
