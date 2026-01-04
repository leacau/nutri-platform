import type { NextFunction, Request, Response } from 'express';
import { denyAuthz } from '../security/authz.js';

const HEADER = 'x-clinic-id';

/**
 * Enforce clinic scope using claims. For platform_admin we allow an override via X-Clinic-Id
 * and annotate it for auditing.
 */
export function requireClinicContext(req: Request, res: Response, next: NextFunction) {
	if (!req.auth) {
		return denyAuthz(req, res, 'Unauthenticated access to clinic scoped route', 401);
	}

	// platform_admin puede operar cross-clinic, opcionalmente usando el header
	if (req.auth.isPlatformAdmin) {
		const overrideClinic = req.header(HEADER) ?? req.auth.clinicId ?? null;
		req.auth = { ...req.auth, clinicId: overrideClinic, role: req.auth.role ?? 'platform_admin' };
		req.audit = { ...(req.audit ?? {}), clinicOverride: overrideClinic };
		return next();
	}

	if (!req.auth.role || !req.auth.clinicId) {
		return denyAuthz(req, res, 'Missing role or clinicId claim for clinic access');
	}

	// Roles de clínica: ignoramos el header si lo envían; fuente de verdad es el claim
	return next();
}
