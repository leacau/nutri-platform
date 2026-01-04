import { connectAuthEmulator, getAuth } from 'firebase/auth';

import { initializeApp } from 'firebase/app';
import { APP_ENV, FIREBASE_CLIENT_CONFIG } from './config/env';

export const firebaseConfig = FIREBASE_CLIENT_CONFIG;

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Emulator-first (NO PROD)
// Evitamos doble conexión en HMR sin depender de flags internos privados.
declare global {
	interface Window {
		__NUTRI_AUTH_EMU_CONNECTED__?: boolean;
	}
}

if (APP_ENV !== 'prod') {
	if (!window.__NUTRI_AUTH_EMU_CONNECTED__) {
		connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
			disableWarnings: true,
		});
		window.__NUTRI_AUTH_EMU_CONNECTED__ = true;
	}
}
