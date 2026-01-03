import type { NextFunction, Request, Response } from 'express';

import type { Role } from '../types/auth.js';
import { denyAuthz } from '../security/authz.js';

export function requireRole(...allowed: Role[]) {
	return (req: Request, res: Response, next: NextFunction) => {
		const auth = req.auth;

		if (!auth || !auth.role) {
			return denyAuthz(req, res, 'Missing role claim');
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
