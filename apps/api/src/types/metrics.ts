import type { Timestamp } from 'firebase-admin/firestore';

export type MetricDoc = {
	clinicId: string;
	patientId: string;
	visitId: string | null;
	measuredAt: Timestamp;
	weightKg: number | null;
	bmi: number | null;
	fatPercentage: number | null;
	muscleMass: number | null;
	waistCm: number | null;
	hipCm: number | null;
	bloodPressure: string | null;
	createdAt: Timestamp;
};
