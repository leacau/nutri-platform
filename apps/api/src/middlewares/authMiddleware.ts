import type { NextFunction, Request, Response } from 'express';

import { requireAuth } from './requireAuth.js';

export async function authMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
) {
	return requireAuth(req, res, next);
}
