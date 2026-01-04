import type { Timestamp } from 'firebase-admin/firestore';
import type { Role } from './auth.js';

export type AppointmentStatus = 'requested' | 'scheduled' | 'cancelled' | 'completed';

export type AppointmentDoc = {
	clinicId: string;
	patientId: string;
	patientUid: string;
	nutriUid: string | null;
	status: AppointmentStatus;
	requestedAt: Timestamp;
	scheduledFor: Timestamp | null;
	cancelledAt: Timestamp | null;
	cancelledByUid: string | null;
	cancelledByRole: Role | null;
	completedAt: Timestamp | null;
	completedByUid: string | null;
	completedByRole: Role | null;
	createdAt: Timestamp;
	updatedAt: Timestamp;
};
