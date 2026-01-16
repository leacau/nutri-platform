import 'dotenv/config';

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';

import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';
const UID = process.argv[2];

// Si querés que también intente custom claims:
// export ALSO_SET_CUSTOM_CLAIMS=true
const ALSO_SET_CUSTOM_CLAIMS = process.env.ALSO_SET_CUSTOM_CLAIMS === 'true';

if (!PROJECT_ID) {
	console.error('❌ Missing FIREBASE_PROJECT_ID');
	process.exit(1);
}
if (!UID) {
	console.error('❌ Usage: node apps/api/scripts/setPlatformAdmin.mjs <uid>');
	process.exit(1);
}

function initAdmin() {
	if (!getApps().length) {
		initializeApp({
			credential: applicationDefault(),
			projectId: PROJECT_ID,
		});
	}
}

function getDb() {
	// Soporta databaseId cuando no es el default
	// getFirestore(databaseId?) está disponible en firebase-admin moderno
	try {
		if (DATABASE_ID && DATABASE_ID !== '(default)') {
			return getFirestore(undefined, DATABASE_ID);
		}
		return getFirestore();
	} catch {
		// fallback seguro al default
		return getFirestore();
	}
}

async function setFirestorePlatformAdmin(uid) {
	const db = getDb();

	// ✅ Opción A: colección dedicada de admins de plataforma
	await db.collection('platformAdmins').doc(uid).set(
		{
			uid,
			enabled: true,
			grantedAt: FieldValue.serverTimestamp(),
			grantedBy: 'local-script',
		},
		{ merge: true }
	);

	// ✅ Opción B: además marcamos el user (si tu backend lee de users/<uid>)
	await db.collection('users').doc(uid).set(
		{
			uid,
			isPlatformAdmin: true,
			updatedAt: FieldValue.serverTimestamp(),
		},
		{ merge: true }
	);

	console.log(`✅ Firestore: platform admin granted for uid=${uid}`);
}

async function trySetCustomClaims(uid) {
	try {
		await getAuth().setCustomUserClaims(uid, { platform_admin: true });
		console.log(`✅ Custom Claims: platform_admin=true set for uid=${uid}`);
	} catch (err) {
		// No frenamos el script: esto hoy te está rompiendo el flujo
		console.warn(
			`⚠️ Custom Claims failed (ignored). Firestore admin already granted. uid=${uid}`
		);
		console.warn(err?.message || err);
	}
}

async function main() {
	initAdmin();

	console.log('[setPlatformAdmin] start', {
		projectId: PROJECT_ID,
		databaseId: DATABASE_ID,
		uid: UID,
		alsoSetCustomClaims: ALSO_SET_CUSTOM_CLAIMS,
	});

	await setFirestorePlatformAdmin(UID);

	if (ALSO_SET_CUSTOM_CLAIMS) {
		await trySetCustomClaims(UID);
	}

	console.log('✅ Done.');
}

main().catch((err) => {
	console.error('❌ Error setting platform admin', err);
	process.exit(1);
});

