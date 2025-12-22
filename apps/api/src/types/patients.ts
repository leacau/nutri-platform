import type { Timestamp } from 'firebase-admin/firestore';

export type PatientDoc = {
	clinicId: string;
	name: string;
	email: string | null;
	phone: string | null;
	linkedUid: string | null;
	createdAt: Timestamp;
	updatedAt: Timestamp;
};
