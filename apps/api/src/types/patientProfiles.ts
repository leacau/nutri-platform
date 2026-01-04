import type { Timestamp } from 'firebase-admin/firestore';

export type PatientProfileDoc = {
	patientId: string;
	birthDate: string | null;
	gender: string | null;
	heightCm: number | null;
	occupation: string | null;
	activityLevel: 'sedentary' | 'light' | 'moderate' | 'high' | null;
	goals: string[] | null;
	medicalConditions: string[] | null;
	allergies: string[] | null;
	medications: string[] | null;
	smoking: 'no' | 'yes' | 'former' | null;
	alcohol: 'no' | 'social' | 'frequent' | null;
	notesAdmin: string | null;
	updatedAt: Timestamp;
};
