export type Patient = {
	id: string;
	name: string;
	email?: string | null;
	phone?: string | null;
	healthInsuranceName?: string | null;
	dni?: string | number | null;
	sexo?: 'male' | 'female' | 'other' | null;
	birthDate?: string | null;
	assignedProfessionalUids?: string[];
	medicalRecordAccessEnabled?: boolean;
};

export type Appointment = {
	id: string;
	patientId: string;
	professionalUid?: string | null;
	status: 'requested' | 'scheduled' | 'arrived' | 'cancelled' | 'completed';
	requestedAt?: unknown;
	scheduledFor?: unknown;
};

export type AppointmentSlot = {
	time: string;
	startsAt: string;
	available: boolean;
	appointmentId?: string;
};

export type AppointmentSlotsResponse = {
	slotMinutes: number;
	free: AppointmentSlot[];
	busy: AppointmentSlot[];
	slots: AppointmentSlot[];
};

export type AppointmentAvailableDay = {
	date: string;
	freeCount: number;
	firstAvailableTime: string | null;
};

export type AppointmentAvailableDaysResponse = {
	days: AppointmentAvailableDay[];
};

export type ClinicalRecord = {
	id: string;
	type: string;
	date: string;
	professionalUid?: string;
	visibleInPatientPortal?: boolean;
	data?: {
		content?: string;
		freeTextContent?: string;
		title?: string;
		note?: string;
		pdf?: {
			fileUrl?: string;
			fileName?: string;
		};
		[key: string]: unknown;
	};
};

export type UserAccount = {
	id: string;
	uid?: string;
	name: string;
	email?: string | null;
};

export type FoodLogMealKey =
	| 'breakfast'
	| 'morningSnack'
	| 'lunch'
	| 'afternoonSnack'
	| 'dinner';

export type FoodLogDayKey =
	| 'monday'
	| 'tuesday'
	| 'wednesday'
	| 'thursday'
	| 'friday'
	| 'saturday'
	| 'sunday';

export type FoodLogDays = Record<
	FoodLogDayKey,
	Record<FoodLogMealKey, { time: string; detail: string }>
>;

export type FoodLog = {
	id: string;
	patientId: string;
	weekStart: string;
	days: FoodLogDays;
	sharedWithProfessionalUids: string[];
	updatedAt?: unknown;
};

export type SessionResponse = {
	uid: string;
	email: string | null;
	patientClinics: Array<{
		clinicId: string;
		clinicName: string | null;
		patientId: string;
	}>;
	resolved: {
		role: string | null;
		clinicId: string | null;
		patientId: string | null;
	};
};
