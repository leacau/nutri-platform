import type { Timestamp } from 'firebase-admin/firestore';
import type { ClinicCapability, ClinicRole } from './auth.js';

export type ClinicDoc = {
	name: string;
	tenantType?: 'clinic' | 'individual_practice';
	ownerProfessionalUid?: string | null;
	isActive?: boolean;
	branding?: {
		logoUrl?: string | null;
		accentColor?: string | null;
	};
	reminderPreferences?: {
		whatsappEnabled?: boolean;
		emailEnabled?: boolean;
	};
	patientAppointmentSelfService?: {
		canCancel?: boolean;
		canReschedule?: boolean;
		minHoursBefore?: number;
	};
	createdAt: Timestamp;
	updatedAt: Timestamp;
};

export type ClinicMembershipDoc = {
	clinicId: string;
	uid: string;
	role: ClinicRole;
	capabilities?: ClinicCapability[];
	isActive: boolean;
	createdAt: Timestamp;
	updatedAt: Timestamp;
	createdByUid: string | null;
};
