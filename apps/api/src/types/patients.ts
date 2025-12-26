import type { Timestamp } from 'firebase-admin/firestore';

export type PatientDoc = {
	clinicId: string;
	name: string;
	email: string | null;
	phone: string | null;
	linkedUid: string | null;

	// NUEVO
	assignedNutriUid?: string | null;

	// audit simple
	createdAt: Timestamp;
	updatedAt: Timestamp;
};
