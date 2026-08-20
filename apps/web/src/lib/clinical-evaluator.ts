// apps/web/src/lib/clinical-evaluator.ts

export type ClinicalStatus =
	| 'low'
	| 'normal'
	| 'warning'
	| 'danger'
	| 'unknown';

export interface EvaluationResult {
	status: ClinicalStatus;
	label: string;
	colorClass: string;
	bgClass: string;
	borderClass: string;
}

export type CustomReferenceRange = {
	label?: string;
	sex?: 'all' | 'male' | 'female' | 'other';
	ageMin?: number | null;
	ageMax?: number | null;
	min?: number | null;
	max?: number | null;
	referenceValue?: number | null;
};

export type CustomMeasurementStandard = {
	name: string;
	referenceRanges: CustomReferenceRange[];
};

const STATUS_UI: Record<
	ClinicalStatus,
	Omit<EvaluationResult, 'status' | 'label'>
> = {
	low: {
		colorClass: 'text-blue-700',
		bgClass: 'bg-blue-50',
		borderClass: 'border-blue-200',
	},
	normal: {
		colorClass: 'text-emerald-700',
		bgClass: 'bg-emerald-50',
		borderClass: 'border-emerald-200',
	},
	warning: {
		colorClass: 'text-amber-700',
		bgClass: 'bg-amber-50',
		borderClass: 'border-amber-200',
	},
	danger: {
		colorClass: 'text-red-700',
		bgClass: 'bg-red-50',
		borderClass: 'border-red-200',
	},
	unknown: {
		colorClass: 'text-slate-700',
		bgClass: 'bg-slate-50',
		borderClass: 'border-slate-200',
	},
};

function genderMatches(rangeSex: string | undefined, gender: string) {
	if (!rangeSex || rangeSex === 'all') return true;
	if (rangeSex === 'female') return gender === 'F' || gender === 'female';
	if (rangeSex === 'male') return gender === 'M' || gender === 'male';
	return rangeSex === gender;
}

function ageMatches(range: CustomReferenceRange, age: number) {
	if (range.ageMin != null && age < range.ageMin) return false;
	if (range.ageMax != null && age > range.ageMax) return false;
	return true;
}

function evaluateCustomStandard(
	standard: CustomMeasurementStandard,
	value: number,
	age: number,
	gender: string,
): EvaluationResult {
	const range =
		standard.referenceRanges.find(
			(item) => genderMatches(item.sex, gender) && ageMatches(item, age),
		) ?? standard.referenceRanges[0];
	if (!range) {
		return { status: 'unknown', label: '', ...STATUS_UI.unknown };
	}

	const labelSuffix = range.label ? ` · ${range.label}` : '';
	if (range.min != null && value < range.min) {
		return { status: 'low', label: `Bajo${labelSuffix}`, ...STATUS_UI.low };
	}
	if (range.max != null && value > range.max) {
		return { status: 'warning', label: `Alto${labelSuffix}`, ...STATUS_UI.warning };
	}
	if (range.referenceValue != null && range.min == null && range.max == null) {
		if (value === range.referenceValue) {
			return { status: 'normal', label: `Normal${labelSuffix}`, ...STATUS_UI.normal };
		}
		return {
			status: value < range.referenceValue ? 'low' : 'warning',
			label: `${value < range.referenceValue ? 'Bajo' : 'Alto'}${labelSuffix}`,
			...(value < range.referenceValue ? STATUS_UI.low : STATUS_UI.warning),
		};
	}

	return { status: 'normal', label: `Normal${labelSuffix}`, ...STATUS_UI.normal };
}

export function evaluateMeasurement(
	indicator: 'bmi' | 'body_fat' | 'muscle' | 'visceral_fat' | string | CustomMeasurementStandard,
	value: number,
	age: number,
	gender: 'M' | 'F' | string,
): EvaluationResult {
	if (typeof indicator !== 'string') {
		return evaluateCustomStandard(indicator, value, age, gender);
	}

	// 1. EVALUACIÓN DE GRASA VISCERAL (Universal)
	if (indicator.toLowerCase().includes('visceral')) {
		if (value <= 9)
			return { status: 'normal', label: 'Normal', ...STATUS_UI.normal };
		if (value <= 14)
			return { status: 'warning', label: 'Alto (+)', ...STATUS_UI.warning };
		return { status: 'danger', label: 'Muy Alto (++)', ...STATUS_UI.danger };
	}

	// 2. EVALUACIÓN DE IMC (Adultos > 19 años - OMS)
	// Nota: Para niños requiere tabla de percentiles Z-Score. Acá aplicamos el estándar de adultos.
	if (
		indicator.toLowerCase().includes('imc') ||
		indicator.toLowerCase().includes('bmi')
	) {
		if (age >= 18) {
			if (value < 18.5)
				return { status: 'low', label: 'Bajo Peso (-)', ...STATUS_UI.low };
			if (value <= 24.9)
				return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
			if (value <= 29.9)
				return {
					status: 'warning',
					label: 'Sobrepeso (+)',
					...STATUS_UI.warning,
				};
			return { status: 'danger', label: 'Obesidad (++)', ...STATUS_UI.danger };
		}
	}

	// 3. EVALUACIÓN DE GRASA CORPORAL (%)
	if (
		indicator.toLowerCase().includes('grasa') ||
		indicator.toLowerCase().includes('fat')
	) {
		if (gender === 'F') {
			if (age >= 20 && age <= 39) {
				if (value < 21.0)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 32.9)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 38.9)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
			if (age >= 40 && age <= 59) {
				if (value < 23.0)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 33.9)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 39.9)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
			if (age >= 60) {
				if (value < 24.0)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 35.9)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 41.9)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
		} else if (gender === 'M') {
			if (age >= 20 && age <= 39) {
				if (value < 8.0)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 19.9)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 24.9)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
			if (age >= 40 && age <= 59) {
				if (value < 11.0)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 21.9)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 27.9)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
			if (age >= 60) {
				if (value < 13.0)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 24.9)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 29.9)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
		}
	}

	// 4. EVALUACIÓN DE MÚSCULO ESQUELÉTICO (%)
	if (
		indicator.toLowerCase().includes('musculo') ||
		indicator.toLowerCase().includes('músculo') ||
		indicator.toLowerCase().includes('muscle')
	) {
		if (gender === 'F') {
			if (age >= 18 && age <= 39) {
				if (value < 24.3)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 30.3)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 35.3)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
			if (age >= 40 && age <= 59) {
				if (value < 24.1)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 30.1)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 35.1)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
			if (age >= 60) {
				if (value < 23.9)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 29.9)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 34.9)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
		} else if (gender === 'M') {
			if (age >= 18 && age <= 39) {
				if (value < 33.3)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 39.3)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 44.0)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
			if (age >= 40 && age <= 59) {
				if (value < 33.1)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 39.1)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 43.8)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
			if (age >= 60) {
				if (value < 32.9)
					return { status: 'low', label: 'Bajo (-)', ...STATUS_UI.low };
				if (value <= 38.9)
					return { status: 'normal', label: 'Normal (0)', ...STATUS_UI.normal };
				if (value <= 43.6)
					return {
						status: 'warning',
						label: 'Elevado (+)',
						...STATUS_UI.warning,
					};
				return {
					status: 'danger',
					label: 'Muy Elevado (++)',
					...STATUS_UI.danger,
				};
			}
		}
	}

	// Si no coincide con un estándar conocido, devolvemos un estado neutral
	return { status: 'unknown', label: '', ...STATUS_UI.unknown };
}
