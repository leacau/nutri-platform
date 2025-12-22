import type { NextFunction, Request, Response } from 'express';

import type { Role } from '../types/auth.js';

export function requireRole(...allowed: Role[]) {
	return (req: Request, res: Response, next: NextFunction) => {
		const auth = req.auth;

		if (!auth || !auth.role) {
			return res.status(403).json({
				success: false,
				message: 'Missing role',
			});
		}

		if (!allowed.includes(auth.role)) {
			return res.status(403).json({
				success: false,
				message: `Role '${auth.role}' not allowed`,
			});
		}

		next();
	};
}
