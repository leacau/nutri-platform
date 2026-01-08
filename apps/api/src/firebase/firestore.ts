import type { Firestore } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from './admin.js';
import { getFirestore } from 'firebase-admin/firestore';

let _db: Firestore | null = null;
let _emulatorConnected = false;

function getDatabaseId(): string | undefined {
	// Si no seteás nada, cae en (default)
	// Para tu caso, seteá FIRESTORE_DATABASE_ID=amsa-core-stg
	return process.env.FIRESTORE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID;
}

export function getFirestoreDb(): Firestore {
	if (_db) return _db;

	const { app } = getFirebaseAdmin();

	const databaseId = getDatabaseId();
	_db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

	// Emulator guard (solo log)
	if (!_emulatorConnected && process.env.FIRESTORE_EMULATOR_HOST) {
		console.log(
			`[firestore] using emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
		);
		_emulatorConnected = true;
	}

	console.log(
		`[firestore] project=${process.env.FIREBASE_PROJECT_ID} database=${
			databaseId ?? '(default)'
		}`
	);

	return _db;
}
