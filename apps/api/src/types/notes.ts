import type { Timestamp } from 'firebase-admin/firestore';

export type ClinicalNoteDoc = {
	clinicId: string;
	patientId: string;
	nutriUid: string;
	content: string;
	visibility: 'private' | 'shared';
	createdAt: Timestamp;
};
