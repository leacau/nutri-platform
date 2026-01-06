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

	if (admin.apps.length === 0) {
		admin.initializeApp({
			credential: admin.credential.applicationDefault(),
			projectId,
		});
	}

	process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? projectId;

	const app = admin.app();
	const auth = admin.auth(app);
	const firestore = admin.firestore(app);

	ctx = { app, auth, firestore };
	return ctx;
}
