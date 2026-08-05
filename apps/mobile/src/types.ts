export type Patient = {
	id: string;
	name: string;
	email?: string | null;
	phone?: string | null;
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
