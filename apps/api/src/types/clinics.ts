import type { Timestamp } from 'firebase-admin/firestore';
import type { ClinicCapability, ClinicRole } from './auth.js';

export type BillingPlanKey =
	| 'individual'
	| 'starter_1_5'
	| 'team_6_15'
	| 'scale_16_50'
	| 'enterprise';

export type BillingStatus =
	| 'trial'
	| 'active'
	| 'past_due'
	| 'suspended'
	| 'cancelled';

export type BillingModuleKey =
	| 'patientPortal'
	| 'automatedMessaging'
	| 'advancedAudit'
	| 'digitalSignature'
	| 'customBranding';

export type ClinicEnabledModules = Record<BillingModuleKey, boolean>;

export type ClinicBillingLimits = {
	professionals: number | null;
	staff: number | null;
	activePatients: number | null;
	storageGb: number | null;
};

export type ClinicBilling = {
	plan: BillingPlanKey;
	status: BillingStatus;
	enabledModules: ClinicEnabledModules;
	limits: ClinicBillingLimits;
	updatedAt?: Timestamp | string | null;
	updatedByUid?: string | null;
};

export type ClinicDoc = {
	name: string;
	tenantType?: 'clinic' | 'individual_practice';
	ownerProfessionalUid?: string | null;
	isActive?: boolean;
	billing?: Partial<ClinicBilling>;
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
