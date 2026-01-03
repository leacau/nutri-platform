import 'dotenv/config';

import { Timestamp } from 'firebase-admin/firestore';
import type { Role } from '../types/auth.js';
import { getFirebaseAdmin } from '../firebase/admin.js';
import { getFirestoreDb } from '../firebase/firestore.js';

type SeedUser = {
	email: string;
	password: string;
	displayName: string;
	role: Role;
	clinicId?: string | null;
};

const DEFAULT_PROJECT_ID = 'demo-nutri-platform';
const DEFAULT_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const DEFAULT_FIRESTORE_EMULATOR_HOST = '127.0.0.1:8088';
const CLINIC_ID = 'clinic_demo_1';

process.env.FIREBASE_PROJECT_ID =
	process.env.FIREBASE_PROJECT_ID ?? DEFAULT_PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST =
	process.env.FIREBASE_AUTH_EMULATOR_HOST ?? DEFAULT_AUTH_EMULATOR_HOST;
process.env.FIRESTORE_EMULATOR_HOST =
	process.env.FIRESTORE_EMULATOR_HOST ?? DEFAULT_FIRESTORE_EMULATOR_HOST;

function log(msg: string, extra?: unknown) {
	if (extra) {
		// eslint-disable-next-line no-console
		console.log(`[seed] ${msg}`, extra);
		return;
	}
	// eslint-disable-next-line no-console
	console.log(`[seed] ${msg}`);
}

async function upsertUser(seed: SeedUser): Promise<string> {
	const { auth } = getFirebaseAdmin();

	try {
		const existing = await auth.getUserByEmail(seed.email);
		await auth.updateUser(existing.uid, {
			password: seed.password,
			displayName: seed.displayName,
		});
		await auth.setCustomUserClaims(existing.uid, {
			role: seed.role,
			clinicId: seed.clinicId ?? null,
		});
		log(`Updated user ${seed.email} (${seed.role})`);
		return existing.uid;
	} catch (err) {
		if ((err as { code?: string } | null)?.code !== 'auth/user-not-found') {
			throw err;
		}
	}

	const created = await auth.createUser({
		email: seed.email,
		password: seed.password,
		displayName: seed.displayName,
	});
	await auth.setCustomUserClaims(created.uid, {
		role: seed.role,
		clinicId: seed.clinicId ?? null,
	});
	log(`Created user ${seed.email} (${seed.role})`);
	return created.uid;
}

async function clearCollection(name: string): Promise<number> {
	const db = getFirestoreDb();
	let total = 0;

	for (;;) {
		const snap = await db.collection(name).limit(500).get();
		if (snap.empty) break;

		const batch = db.batch();
		snap.docs.forEach((doc) => batch.delete(doc.ref));
		await batch.commit();
		total += snap.size;
	}

	return total;
}

async function seedPatients(patientUid: string, assignedNutriUid: string) {
	const db = getFirestoreDb();
	const now = Timestamp.now();

	const patientDoc = {
		clinicId: CLINIC_ID,
		name: 'Paciente Demo',
		email: 'patient@test.com',
		phone: '+549111111111',
		linkedUid: patientUid,
		assignedNutriUid,
		createdAt: now,
		updatedAt: now,
	};

	await db.collection('patients').doc('patient_demo_1').set(patientDoc);
	log('Seeded patient patient_demo_1 linked to Auth user');

	return 'patient_demo_1';
}

async function seedAppointments(
	patientId: string,
	patientUid: string,
	nutriUid: string
) {
	const db = getFirestoreDb();
	const now = Timestamp.now();

	const tomorrow = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);

	const appointments = [
		{
			id: 'appt_demo_scheduled',
			clinicId: CLINIC_ID,
			patientId,
			patientUid,
			nutriUid,
			status: 'scheduled' as const,
			requestedAt: now,
			scheduledFor: tomorrow,
			cancelledAt: null,
			cancelledByUid: null,
			cancelledByRole: null,
			completedAt: null,
			completedByUid: null,
			completedByRole: null,
			createdAt: now,
			updatedAt: now,
		},
		{
			id: 'appt_demo_requested',
			clinicId: CLINIC_ID,
			patientId,
			patientUid,
			nutriUid,
			status: 'requested' as const,
			requestedAt: now,
			scheduledFor: null,
			cancelledAt: null,
			cancelledByUid: null,
			cancelledByRole: null,
			completedAt: null,
			completedByUid: null,
			completedByRole: null,
			createdAt: now,
			updatedAt: now,
		},
	];

	for (const appt of appointments) {
		await db.collection('appointments').doc(appt.id).set(appt);
		log(`Seeded appointment ${appt.id} (${appt.status})`);
	}
}

async function main() {
	log('Starting emulator seed');
	log('Project ID', process.env.FIREBASE_PROJECT_ID);
	log('Auth emulator', process.env.FIREBASE_AUTH_EMULATOR_HOST);
	log('Firestore emulator', process.env.FIRESTORE_EMULATOR_HOST);

	const { firestore } = getFirebaseAdmin();
	firestore.settings({ ignoreUndefinedProperties: true });

	const users: Record<
		'patient' | 'nutri' | 'clinic' | 'platform',
		SeedUser
	> = {
		patient: {
			email: 'patient@test.com',
			password: 'Passw0rd!',
			displayName: 'Paciente Demo',
			role: 'patient',
			clinicId: CLINIC_ID,
		},
		nutri: {
			email: 'nutri@test.com',
			password: 'Passw0rd!',
			displayName: 'Nutri Demo',
			role: 'nutri',
			clinicId: CLINIC_ID,
		},
		clinic: {
			email: 'clinic-admin@test.com',
			password: 'Passw0rd!',
			displayName: 'Clinic Admin Demo',
			role: 'clinic_admin',
			clinicId: CLINIC_ID,
		},
		platform: {
			email: 'platform-admin@test.com',
			password: 'Passw0rd!',
			displayName: 'Platform Admin Demo',
			role: 'platform_admin',
			clinicId: null,
		},
	};

	const patientUid = await upsertUser(users.patient);
	const nutriUid = await upsertUser(users.nutri);
	await upsertUser(users.clinic);
	await upsertUser(users.platform);

	const clearedPatients = await clearCollection('patients');
	const clearedAppointments = await clearCollection('appointments');
	log(
		`Cleared collections (patients: ${clearedPatients}, appointments: ${clearedAppointments})`
	);

	const patientId = await seedPatients(patientUid, nutriUid);
	await seedAppointments(patientId, patientUid, nutriUid);

	log('Emulator seed completed');
}

main().catch((err) => {
	// eslint-disable-next-line no-console
	console.error(err);
	process.exitCode = 1;
});
