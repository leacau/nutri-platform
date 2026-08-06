import type {
	BillingModuleKey,
	BillingPlanKey,
	ClinicBilling,
	ClinicBillingLimits,
	ClinicEnabledModules,
} from '../types/clinics.js';

export const BILLING_MODULES: BillingModuleKey[] = [
	'patientPortal',
	'automatedMessaging',
	'advancedAudit',
	'digitalSignature',
	'customBranding',
];

export const DEFAULT_MODULES: ClinicEnabledModules = {
	patientPortal: false,
	automatedMessaging: false,
	advancedAudit: false,
	digitalSignature: false,
	customBranding: false,
};

export const PLAN_LIMITS: Record<BillingPlanKey, ClinicBillingLimits> = {
	individual: {
		professionals: 1,
		staff: 1,
		activePatients: 100,
		storageGb: 2,
	},
	starter_1_5: {
		professionals: 5,
		staff: 4,
		activePatients: 500,
		storageGb: 10,
	},
	team_6_15: {
		professionals: 15,
		staff: 10,
		activePatients: 2000,
		storageGb: 30,
	},
	scale_16_50: {
		professionals: 50,
		staff: 30,
		activePatients: 10000,
		storageGb: 100,
	},
	enterprise: {
		professionals: null,
		staff: null,
		activePatients: null,
		storageGb: null,
	},
};

export const PLAN_LABELS: Record<BillingPlanKey, string> = {
	individual: 'Individual',
	starter_1_5: 'Inicial 1-5 profesionales',
	team_6_15: 'Equipo 6-15 profesionales',
	scale_16_50: 'Escala 16-50 profesionales',
	enterprise: 'Enterprise',
};

export function defaultBillingForPlan(plan: BillingPlanKey): ClinicBilling {
	return {
		plan,
		status: 'trial',
		enabledModules: { ...DEFAULT_MODULES },
		limits: { ...PLAN_LIMITS[plan] },
	};
}

export function normalizeBilling(
	input: Partial<ClinicBilling> | undefined,
	fallbackPlan: BillingPlanKey,
): ClinicBilling {
	const plan = input?.plan ?? fallbackPlan;
	return {
		plan,
		status: input?.status ?? 'trial',
		enabledModules: {
			...DEFAULT_MODULES,
			...(input?.enabledModules ?? {}),
		},
		limits: {
			...PLAN_LIMITS[plan],
			...(input?.limits ?? {}),
		},
		updatedAt: input?.updatedAt ?? null,
		updatedByUid: input?.updatedByUid ?? null,
	};
}
