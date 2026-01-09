import type { Timestamp } from 'firebase-admin/firestore';

export type ClinicalNoteDoc = {
	clinicId: string;
	patientId: string;
	professionalUid: string;
	content: string;
	visibility: 'private' | 'shared';
	createdAt: Timestamp;
};
