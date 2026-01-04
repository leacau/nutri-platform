const EMAIL_REGEX = /([\w.+-]{1,})@([\w.-]{1,}\.[A-Za-z]{2,})/i;
const PHONE_REGEX = /[+\d][\d\s().-]{6,}/;

export function maskEmail(email: string | null | undefined, fallback = '—'): string {
	if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email)) return fallback;
	const [, user, domain] = email.match(EMAIL_REGEX) ?? [];
	const safeUser = `${user.slice(0, 2)}${'*'.repeat(Math.max(user.length - 2, 3))}`;
	const domainParts = domain.split('.');
	const safeDomainHead = domainParts[0] ? `${domainParts[0].slice(0, 1)}***` : '***';
	const safeDomainTail = domainParts.slice(1).join('.') || domain;
	return `${safeUser}@${safeDomainHead}.${safeDomainTail}`;
}

export function maskPhone(phone: string | null | undefined, fallback = '—'): string {
	if (!phone || typeof phone !== 'string' || !PHONE_REGEX.test(phone)) return fallback;
	const digits = phone.replace(/\D/g, '');
	const tail = digits.slice(-4);
	const masked = `${'*'.repeat(Math.max(digits.length - 4, 4))}${tail}`;
	return masked.replace(/(.{3})/g, '$1 ').trim();
}

function scrubString(value: string): string {
	if (EMAIL_REGEX.test(value)) {
		const match = value.match(EMAIL_REGEX);
		if (match) return value.replace(EMAIL_REGEX, maskEmail(match[0]));
	}
	if (PHONE_REGEX.test(value)) {
		const match = value.match(PHONE_REGEX);
		if (match) return value.replace(PHONE_REGEX, maskPhone(match[0]));
	}
	return value;
}

export function scrubPII<T>(value: T): T {
	if (typeof value === 'string') {
		return scrubString(value) as T;
	}
	if (Array.isArray(value)) {
		return value.map((item) => scrubPII(item)) as unknown as T;
	}
	if (value && typeof value === 'object') {
		return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [k, v]) => {
			acc[k] = scrubPII(v);
			return acc;
		}, {}) as unknown as T;
	}
	return value;
}

export function formatAuditId(auditId: string | undefined | null, visible = 8): string {
	if (!auditId) return '—';
	return auditId.length <= visible ? auditId : `${auditId.slice(0, visible)}…`;
}
