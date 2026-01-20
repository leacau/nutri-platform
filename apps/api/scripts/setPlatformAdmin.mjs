import 'dotenv/config';

import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';

import fs from 'node:fs';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'node:path';
import process from 'node:process';

/**
 * Uso:
 *   # (recomendado) con ADC (gcloud auth application-default login)
 *   FIREBASE_PROJECT_ID=amsa-core-stg node apps/api/scripts/setPlatformAdmin.mjs <uid>
 *
 * Opcional:
 *   # si querés forzar un service account JSON:
 *   GOOGLE_APPLICATION_CREDENTIALS=/abs/path/service-account.json FIREBASE_PROJECT_ID=amsa-core-stg node apps/api/scripts/setPlatformAdmin.mjs <uid>
 *
 * Qué hace:
 *   1) Intenta setear custom claim { platform_admin: true } (si tenés permisos)
 *   2) SIEMPRE escribe en Firestore un registro como platform admin:
 *        platformAdmins/<uid> { enabled: true, grantedAt, grantedBy }
 *      y además marca users/<uid>.isPlatformAdmin = true (merge)
 *   3) Lee lo escrito y lo imprime (confirmación).
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const UID = process.argv[2];

if (!PROJECT_ID) {
	console.error('❌ Missing FIREBASE_PROJECT_ID');
	process.exit(1);
}
if (!UID) {
	console.error('❌ Usage: node apps/api/scripts/setPlatformAdmin.mjs <uid>');
	process.exit(1);
}

function initAdmin() {
	// Si GOOGLE_APPLICATION_CREDENTIALS está seteado y apunta a un archivo real, lo usamos.
	// Sino, ADC (applicationDefault) y listo.
	const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

	if (credsPath) {
		const abs = path.isAbsolute(credsPath)
			? credsPath
			: path.resolve(credsPath);
		if (!fs.existsSync(abs)) {
			console.error(
				`❌ GOOGLE_APPLICATION_CREDENTIALS points to missing file: ${abs}`,
			);
			process.exit(1);
		}
		const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
		initializeApp({
			credential: cert(json),
			projectId: PROJECT_ID,
		});
		return { mode: 'service-account', path: abs };
	}

	initializeApp({
		credential: applicationDefault(),
		projectId: PROJECT_ID,
	});
	return { mode: 'adc' };
}

async function setCustomClaimIfPossible(uid) {
	try {
		await getAuth().setCustomUserClaims(uid, { platform_admin: true });
		console.log(`✅ Custom claim set: platform_admin=true for uid=${uid}`);
		return true;
	} catch (err) {
		// No frenamos el script por claims: Firestore nos sirve como fuente de verdad.
		console.warn(
			'⚠️ Could not set custom claims (continuing with Firestore admin flag).',
		);
		console.warn(err?.message || err);
		return false;
	}
}

async function writeFirestoreAdminFlag(uid) {
	const db = getFirestore();

	const now = new Date();
	const by = process.env.ADMIN_GRANTED_BY || 'script';

	// Colección dedicada
	await db.collection('platformAdmins').doc(uid).set(
		{
			enabled: true,
			grantedAt: now.toISOString(),
			grantedBy: by,
			projectId: PROJECT_ID,
		},
		{ merge: true },
	);

	// Flag espejo en users (por si tu backend mira ahí)
	await db.collection('users').doc(uid).set(
		{
			isPlatformAdmin: true,
			updatedAt: now.toISOString(),
		},
		{ merge: true },
	);

	console.log(`✅ Firestore written:
- platformAdmins/${uid}.enabled=true
- users/${uid}.isPlatformAdmin=true`);
}

async function readBack(uid) {
	const db = getFirestore();
	const a = await db.collection('platformAdmins').doc(uid).get();
	const u = await db.collection('users').doc(uid).get();

	console.log('--- Verification read ---');
	console.log('platformAdmins exists:', a.exists);
	console.log('platformAdmins data:', a.exists ? a.data() : null);
	console.log('users exists:', u.exists);
	console.log('users data:', u.exists ? u.data() : null);
}

async function main() {
	const info = initAdmin();
	console.log(
		`ℹ️ Admin init mode: ${info.mode}${info.path ? ` (${info.path})` : ''}`,
	);

	await setCustomClaimIfPossible(UID);
	await writeFirestoreAdminFlag(UID);
	await readBack(UID);

	console.log('✅ Done.');
}

main().catch((err) => {
	console.error('❌ Error setting platform admin', err);
	process.exit(1);
});

