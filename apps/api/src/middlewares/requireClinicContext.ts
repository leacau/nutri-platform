import type { NextFunction, Request, Response } from 'express';
import { denyAuthz } from '../security/authz.js';

/**
 * Aplica SOLO a roles de equipo.
 * platform_admin queda excluido a propósito.
 */
export function requireClinicContext(
	req: Request,
	res: Response,
	next: NextFunction
) {
	const auth = req.auth;

	if (!auth) {
		return denyAuthz(req, res, 'Unauthenticated access to clinic scoped route');
	}

	if (auth.role === 'platform_admin') {
		return next();
	}

	if (!auth.clinicId) {
		return denyAuthz(
			req,
			res,
			'clinicId claim missing for clinic-scoped role access'
		);
	}

	next();
}
