import type { NextFunction, Request, Response } from 'express';

import type { Role } from '../types/auth.js';
import { denyAuthz } from '../security/authz.js';

export function requireRole(...allowed: Role[]) {
	return (req: Request, res: Response, next: NextFunction) => {
		const auth = req.auth;

		if (!auth) {
			return denyAuthz(req, res, 'Missing auth context', 401);
		}

		if (auth.isPlatformAdmin) {
			return next();
		}

		if (!auth.role) {
			return denyAuthz(req, res, 'Missing role for clinic access');
		}

		if (!allowed.includes(auth.role)) {
			return denyAuthz(
				req,
				res,
				`Role ${auth.role} not allowed. Allowed=${allowed.join(',')}`
			);
		}

		next();
	};
}
