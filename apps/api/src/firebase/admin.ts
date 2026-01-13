import admin from 'firebase-admin';

type FirebaseAdminContext = {
	app: admin.app.App;
	auth: admin.auth.Auth;
};

let ctx: FirebaseAdminContext | null = null;

function mustGetEnv(name: string): string {
	const v = process.env[name];
	if (!v) throw new Error(`Missing env var: ${name}`);
	return v;
}

export function getFirebaseAdmin(): FirebaseAdminContext {
	if (ctx) return ctx;

	// Fuente de verdad: env var (Cloud Run / local)
	const projectId =
		process.env.FIREBASE_PROJECT_ID ??
		process.env.GCLOUD_PROJECT ??
		mustGetEnv('FIREBASE_PROJECT_ID');

	if (admin.apps.length === 0) {
		admin.initializeApp({
			credential: admin.credential.applicationDefault(),
			projectId,
		});
	}

	// Algunos SDKs miran GCLOUD_PROJECT: lo seteamos como “fallback”
	process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? projectId;

	// NOTE: Do NOT use the admin Firestore client directly.
	// This project uses multi-database; always use getFirestoreDb() from firebase/firestore.ts
	const app = admin.app();
	const auth = admin.auth(app);

	ctx = { app, auth };
	return ctx;
}
