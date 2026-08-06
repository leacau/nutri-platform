import {
	GoogleAuthProvider,
	connectAuthEmulator,
	getAuth,
} from 'firebase/auth';
import { getApp, getApps, initializeApp } from 'firebase/app';

const firebaseConfig = {
	apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
	authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Bandera para evitar que Next.js intente conectarse múltiples veces por el hot-reloading
let isAuthEmulatorConnected = false;

export function getFirebaseApp() {
	if (!getApps().length) {
		initializeApp(firebaseConfig);
	}
	return getApp();
}

export function getFirebaseAuth() {
	const app = getFirebaseApp();
	const auth = getAuth(app);

	if (
		process.env.NEXT_PUBLIC_USE_EMULATORS === 'true' &&
		!isAuthEmulatorConnected
	) {
		const emulatorHost =
			process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

		connectAuthEmulator(auth, `http://${emulatorHost}`, {
			disableWarnings: true, // Quita el cartel molesto de advertencia en la UI
		});

		isAuthEmulatorConnected = true;
	}

	return auth;
}

export const googleProvider = new GoogleAuthProvider();
