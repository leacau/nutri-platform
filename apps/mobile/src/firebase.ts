import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import * as FirebaseAuth from '@firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

type FirebaseAuthModule = typeof import('firebase/auth') & {
	getReactNativePersistence?: (storage: typeof ReactNativeAsyncStorage) => unknown;
};

const firebaseConfig = {
	apiKey:
		process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
		'AIzaSyBzy2pkog6xIaKszB1Rc3qY1khThA41C2s',
	authDomain:
		process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
		'amsa-core-stg.firebaseapp.com',
	projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'amsa-core-stg',
	storageBucket:
		process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
		'amsa-core-stg.firebasestorage.app',
	messagingSenderId:
		process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '418425481470',
	appId:
		process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
		'1:418425481470:web:cad4b57bf186be886b5daf',
};

function getFirebaseApp(): FirebaseApp {
	if (!getApps().length) {
		return initializeApp(firebaseConfig);
	}
	return getApp();
}

let firebaseAuth: Auth | null = null;

export function getFirebaseAuth(): Auth {
	const app = getFirebaseApp();
	if (firebaseAuth) return firebaseAuth;
	const authModule = FirebaseAuth as unknown as FirebaseAuthModule;

	try {
		const persistence =
			authModule.getReactNativePersistence?.(ReactNativeAsyncStorage);
		firebaseAuth = authModule.initializeAuth(app, {
			...(persistence ? { persistence } : {}),
		} as never);
	} catch {
		firebaseAuth = authModule.getAuth(app);
	}

	return firebaseAuth;
}
