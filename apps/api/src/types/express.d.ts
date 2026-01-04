import type { AuthContext, PatientContext } from './auth.js';

declare global {
	namespace Express {
		interface Request {
			auth?: AuthContext;
			patientContext?: PatientContext;
			audit?: { clinicOverride?: string | null };
		}
	}
}

export {};
