import admin from 'firebase-admin';

type FirebaseAdminContext = {
	app: admin.app.App;
	auth: admin.auth.Auth;
	firestore: admin.firestore.Firestore;
};

let ctx: FirebaseAdminContext | null = null;

function mustGetEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing env var: ${name}`);
	return v;
}

export function getFirebaseAdmin(): FirebaseAdminContext {
	if (ctx) return ctx;

	const projectId = mustGetEnv('FIREBASE_PROJECT_ID');

	/**
	 * Emulator-first:
	 * - Auth emulator: FIREBASE_AUTH_EMULATOR_HOST
	 * - Firestore emulator: FIRESTORE_EMULATOR_HOST
	 *
	 * En emuladores, NO queremos credenciales reales.
	 * initializeApp({ projectId }) alcanza.
	 */
	if (admin.apps.length === 0) {
		admin.initializeApp({ projectId });
	}

	// Aseguramos project id también para libs que miran GCLOUD_PROJECT
	process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? projectId;

	const app = admin.app();
	const auth = admin.auth(app);

	const firestore = admin.firestore(app);
	// Firestore emulator suele necesitar esto para evitar warnings/behaviors raros
	firestore.settings({ ignoreUndefinedProperties: true });

	ctx = { app, auth, firestore };
	return ctx;
}
