import type { Firestore } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from './admin.js';
import { getFirestore } from 'firebase-admin/firestore';

let _db: Firestore | null = null;
let _emulatorConnected = false;

export function getFirestoreDb(): Firestore {
	if (_db) return _db;

	const { app } = getFirebaseAdmin();
	_db = getFirestore(app);

	// Conectar emulador (solo en dev). Evita que el admin SDK se vaya a prod por accidente.
	// FIRESTORE_EMULATOR_HOST lo setea firebase-tools cuando corrés emulators:start.
	if (!_emulatorConnected && process.env.FIRESTORE_EMULATOR_HOST) {
		// En admin SDK v11+, Firestore lee FIRESTORE_EMULATOR_HOST automáticamente.
		// Aun así, dejamos el guard como “tripwire” para loguear y evitar confusiones.
		// eslint-disable-next-line no-console
		console.log(
			`[firestore] using emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
		);
		_emulatorConnected = true;
	}

	return _db;
}
