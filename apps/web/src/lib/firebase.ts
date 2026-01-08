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
		typeof window !== 'undefined' &&
		process.env.NEXT_PUBLIC_USE_EMULATORS === 'true'
	) {
		const emulatorHost =
			process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
		connectAuthEmulator(auth, `http://${emulatorHost}`, {
			disableWarnings: true,
		});
	}
	return auth;
}

export const googleProvider = new GoogleAuthProvider();
