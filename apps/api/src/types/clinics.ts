import type { Timestamp } from 'firebase-admin/firestore';
import type { ClinicRole } from './auth.js';

export type ClinicDoc = {
	name: string;
	isActive?: boolean;
	createdAt: Timestamp;
	updatedAt: Timestamp;
};

export type ClinicMembershipDoc = {
	clinicId: string;
	uid: string;
	role: ClinicRole;
	isActive: boolean;
	createdAt: Timestamp;
	updatedAt: Timestamp;
	createdByUid: string | null;
};