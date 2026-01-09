import type { Timestamp } from 'firebase-admin/firestore';

export type NutritionPlanDoc = {
	clinicId: string;
	patientId: string;
	professionalUid: string;
	type: string;
	caloriesTarget: number | null;
	macros: { protein: number | null; carbs: number | null; fat: number | null } | null;
	mealsPerDay: number | null;
	guidelines: string | null;
	validFrom: Timestamp;
	validTo: Timestamp | null;
	active: boolean;
	createdAt: Timestamp;
	updatedAt: Timestamp;
};
