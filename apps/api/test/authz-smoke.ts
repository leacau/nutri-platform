import assert from 'node:assert/strict';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

import { requireClinicContext } from '../src/middlewares/requireClinicContext.js';
import { requireRole } from '../src/middlewares/requireRole.js';
import type { AuthContext } from '../src/types/auth.js';

type MockAuthHeader =
	| string
	| {
			uid?: string;
			role?: AuthContext['role'];
			clinicId?: string | null;
	  };

function mockAuth(auth: MockAuthHeader) {
	return (req: Request, _res: Response, next: NextFunction) => {
		const header = req.get('x-auth');
		if (header) {
			req.auth = JSON.parse(header);
			next();
			return;
		}

		if (typeof auth === 'string') {
			req.auth = JSON.parse(auth);
		} else {
			req.auth = {
				uid: auth.uid ?? 'u-mock',
				role: auth.role,
				clinicId: auth.clinicId ?? null,
				email: null,
			};
		}
		next();
	};
}

function buildTestApp() {
	const app = express();
	app.use(express.json());

	app.get(
		'/clinic-only',
		mockAuth({}),
		requireRole('clinic_admin', 'nutri', 'staff'),
		requireClinicContext,
		(_req, res) => {
			res.status(200).json({ success: true });
		}
	);

	app.get(
		'/nutri-only',
		mockAuth({ role: 'clinic_admin', clinicId: 'c1' }),
		requireRole('nutri'),
		(_req, res) => {
			res.status(200).json({ success: true });
		}
	);

	app.get(
		'/clinic-with-claim',
		mockAuth({ role: 'clinic_admin', clinicId: 'c1' }),
		requireRole('clinic_admin'),
		requireClinicContext,
		(_req, res) => {
			res.status(200).json({ success: true });
		}
	);

	return app;
}

async function run() {
	const app = buildTestApp();

	// Missing role claim => 403
	const noRole = await request(app).get('/clinic-only');
	assert.equal(noRole.status, 403);
	assert.equal(noRole.body.success, false);
	assert.equal(noRole.body.message, 'Forbidden');

	// Patient role not allowed
	const patient = await request(app)
		.get('/clinic-only')
		.set('x-auth', JSON.stringify({ role: 'patient' }));
	assert.equal(patient.status, 403);
	assert.equal(patient.body.message, 'Forbidden');

	// Clinic admin without clinicId claim is rejected
	const clinicNoClaim = await request(app)
		.get('/clinic-only')
		.set('x-auth', JSON.stringify({ role: 'clinic_admin' }));
	assert.equal(clinicNoClaim.status, 403);
	assert.equal(clinicNoClaim.body.message, 'Forbidden');

	// Wrong role for nutri route
	const wrongRole = await request(app).get('/nutri-only');
	assert.equal(wrongRole.status, 403);
	assert.equal(wrongRole.body.message, 'Forbidden');

	// Happy path with clinicId claim
	const okClinic = await request(app).get('/clinic-with-claim');
	assert.equal(okClinic.status, 200);
	assert.equal(okClinic.body.success, true);
}

run().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exitCode = 1;
});
