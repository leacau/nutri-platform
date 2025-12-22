import { connectAuthEmulator, getAuth } from 'firebase/auth';

import { initializeApp } from 'firebase/app';

const firebaseConfig = {
	apiKey: 'fake-api-key',
	authDomain: 'demo-nutri-platform.firebaseapp.com',
	projectId: 'demo-nutri-platform',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

// Emulator-first (NO PROD)
// Evitamos doble conexión en HMR sin depender de flags internos privados.
declare global {
	interface Window {
		__NUTRI_AUTH_EMU_CONNECTED__?: boolean;
	}
}

if (!import.meta.env.PROD) {
	if (!window.__NUTRI_AUTH_EMU_CONNECTED__) {
		connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
			disableWarnings: true,
		});
		window.__NUTRI_AUTH_EMU_CONNECTED__ = true;
	}
}
