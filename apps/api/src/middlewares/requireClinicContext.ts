import type { NextFunction, Request, Response } from 'express';

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
		return res.status(403).json({
			success: false,
			message: 'Unauthenticated',
		});
	}

	if (auth.role === 'platform_admin') {
		return next();
	}

	if (!auth.clinicId) {
		return res.status(403).json({
			success: false,
			message: 'clinicId is required for this role',
		});
	}

	next();
}
