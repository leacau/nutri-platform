import type { Request, Response } from 'express';

type AuthzLog = {
	event: 'authz_denied';
	status: number;
	method: string;
	endpoint: string;
	role: string | null;
	uid: string | null;
	clinicId: string | null;
	reason: string;
};

function buildAuthzLog(req: Request, status: number, reason: string): AuthzLog {
	return {
		event: 'authz_denied',
		status,
		method: req.method,
		endpoint: req.originalUrl ?? req.url,
		role: req.auth?.role ?? null,
		uid: req.auth?.uid ?? null,
		clinicId: req.auth?.clinicId ?? null,
		reason,
	};
}

export function logAuthzDenied(req: Request, status: number, reason: string) {
	const payload = buildAuthzLog(req, status, reason);
	console.warn(JSON.stringify(payload));
}

export function denyAuthz(
	req: Request,
	res: Response,
	reason: string,
	status = 403
) {
	logAuthzDenied(req, status, reason);
	return res.status(status).json({ success: false, message: 'Forbidden' });
}
