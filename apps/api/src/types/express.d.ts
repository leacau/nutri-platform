import type { AuthContext, AuthenticatedUser, PatientContext } from './auth.js';

declare global {
	namespace Express {
		interface Request {
			auth?: AuthContext;
			user?: AuthenticatedUser;
			patientContext?: PatientContext;
		}
	}
}

export {};
