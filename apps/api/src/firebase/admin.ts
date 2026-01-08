import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore'; // Importación necesaria para DBs nombradas

type FirebaseAdminContext = {
	app: admin.app.App;
	auth: admin.auth.Auth;
	firestore: admin.firestore.Firestore;
};

let ctx: FirebaseAdminContext | null = null;

export function getFirebaseAdmin(): FirebaseAdminContext {
	if (ctx) return ctx;

	// Si no se ha inicializado, lo hacemos.
	if (admin.apps.length === 0) {
		console.log(
			'[Firebase Admin] Inicializando con credenciales automáticas (JSON)...'
		);
		admin.initializeApp({
			credential: admin.credential.applicationDefault(),
			// Dejamos que el SDK tome el projectId del JSON
		});
	}

	const app = admin.app();

	// @ts-ignore Acceso a propiedad interna para debug
	const detectedProjectId =
		app.options.credential?.projectId || app.options.projectId;
	console.log(`[Firebase Admin] Project ID detectado: ${detectedProjectId}`);

	const auth = admin.auth(app);

	// SOLUCIÓN: Conectamos explícitamente a la base de datos "amsa-core-stg"
	console.log('[Firebase Admin] Conectando a Firestore DB: amsa-core-stg');
	const firestore = getFirestore(app, 'amsa-core-stg');

	// Configuración para Cloud Functions / Google Cloud
	if (detectedProjectId) {
		process.env.GCLOUD_PROJECT = detectedProjectId;
	}

	ctx = { app, auth, firestore };
	return ctx;
}
