import type { Role } from './auth.js';
import type { Timestamp } from 'firebase-admin/firestore';

export type AppointmentStatus =
	| 'requested'
	| 'scheduled'
	| 'arrived'
	| 'cancelled'
	| 'completed';

export type AppointmentDoc = {
	clinicId: string;
	patientId: string;
	patientUid: string;
	professionalUid: string | null;
	status: AppointmentStatus;
	requestedAt: Timestamp;
	scheduledFor: Timestamp | null;
	arrivedAt?: Timestamp | null;
	cancelledAt: Timestamp | null;
	cancelledByUid: string | null;
	cancelledByRole: Role | null;
	completedAt: Timestamp | null;
	completedByUid: string | null;
	completedByRole: Role | null;
	createdAt: Timestamp;
	updatedAt: Timestamp;
};
