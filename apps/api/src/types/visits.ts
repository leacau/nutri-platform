import type { Timestamp } from 'firebase-admin/firestore';

export type VisitDoc = {
	clinicId: string;
	patientId: string;
	nutriUid: string;
	appointmentId: string | null;
	date: Timestamp;
	reason: string | null;
	clinicalNotes: string | null;
	adherence: 'low' | 'medium' | 'high' | null;
	recommendations: string | null;
	createdAt: Timestamp;
	updatedAt: Timestamp;
};
