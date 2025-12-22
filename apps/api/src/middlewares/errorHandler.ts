import type { NextFunction, Request, Response } from 'express';

import { ZodError } from 'zod';

type ApiErrorPayload = {
	success: false;
	message: string;
	errors?: unknown;
};

export function errorHandler(
	err: unknown,
	_req: Request,
	res: Response,
	_next: NextFunction
): void {
	// Zod validation errors
	if (err instanceof ZodError) {
		const payload: ApiErrorPayload = {
			success: false,
			message: 'Validation error',
			errors: err.flatten(),
		};
		res.status(400).json(payload);
		return;
	}

	// Known-ish error objects
	if (err && typeof err === 'object' && 'message' in err) {
		const payload: ApiErrorPayload = {
			success: false,
			message: String((err as { message: unknown }).message),
		};
		res.status(500).json(payload);
		return;
	}

	res.status(500).json({ success: false, message: 'Unexpected error' });
}
