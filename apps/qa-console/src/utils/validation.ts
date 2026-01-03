export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PHONE_PATTERN = /^\+?[0-9 ()-]{7,20}$/;

export const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function isValidEmail(value: string): boolean {
	return EMAIL_PATTERN.test(value.trim());
}

export function isValidPhone(value: string): boolean {
	if (!value.trim()) return false;
	const normalizedDigits = value.replace(/\D/g, '');
	return normalizedDigits.length >= 7 && PHONE_PATTERN.test(value.trim());
}

export function isValidDatetimeLocal(value: string): boolean {
	if (!value) return false;
	if (!DATETIME_LOCAL_PATTERN.test(value)) return false;
	const parsed = new Date(value);
	return Number.isFinite(parsed.getTime());
}

export function toIsoFromDatetimeLocal(value: string): string | null {
	if (!isValidDatetimeLocal(value)) return null;
	return new Date(value).toISOString();
}
