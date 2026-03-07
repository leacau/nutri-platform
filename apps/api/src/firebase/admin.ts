import admin from 'firebase-admin';

export type FirebaseAdminContext = {
	app: admin.app.App;
	auth: admin.auth.Auth;
};

let ctx: FirebaseAdminContext | null = null;

export function getFirebaseAdmin(): FirebaseAdminContext {
	if (ctx) return ctx;

	// Fuente de verdad unificada
	const projectId =
		process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;

	if (!projectId) {
		throw new Error(
			'FIREBASE_PROJECT_ID or GCLOUD_PROJECT is required to initialize Firebase Admin.',
		);
	}

	// Algunos SDKs de Google miran GCLOUD_PROJECT obligatoriamente
	process.env.GCLOUD_PROJECT = projectId;

	if (admin.apps.length === 0) {
		// Detectamos si estamos usando emuladores verificando si existen las variables
		const isUsingEmulator =
			!!process.env.FIREBASE_AUTH_EMULATOR_HOST ||
			!!process.env.FIRESTORE_EMULATOR_HOST;

		admin.initializeApp({
			credential: admin.credential.applicationDefault(),
			projectId,
		});

		if (isUsingEmulator) {
			console.log(
				`[firebase] Connected to LOCAL EMULATORS targeting project: ${projectId}`,
			);
		} else {
			console.log(
				`[firebase] Connected to REAL CLOUD ENVIRONMENT targeting project: ${projectId}`,
			);
		}
	}

	// NOTE: Do NOT use admin.firestore() directly.
	// This project uses multi-database; always use getFirestoreDb() from firebase/firestore.ts
	const app = admin.app();
	const auth = admin.auth(app);

	ctx = { app, auth };
	return ctx;
}
