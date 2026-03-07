import 'dotenv/config';

import { getFirebaseAdmin } from '../firebase/admin.js';

if (
	!process.env.FIREBASE_AUTH_EMULATOR_HOST ||
	!process.env.FIRESTORE_EMULATOR_HOST
) {
	console.error(
		'⚠️ ALERTA FATAL: No se detectaron las variables de entorno de los emuladores.',
	);
	process.exit(1);
}

const { auth, app } = getFirebaseAdmin();
const db = app.firestore();

async function seed() {
	console.log('🌱 Iniciando carga de datos (seed) en el emulador...');

	const usersToCreate = [
		{
			email: 'patient@test.com',
			password: 'Passw0rd!',
			role: 'patient',
			clinicId: 'clinic_demo_1',
		},
		{
			email: 'nutri@test.com',
			password: 'Passw0rd!',
			role: 'nutri',
			clinicId: 'clinic_demo_1',
		},
		{
			email: 'clinic-admin@test.com',
			password: 'Passw0rd!',
			role: 'clinic_admin',
			clinicId: 'clinic_demo_1',
		},
		{
			email: 'platform-admin@test.com',
			password: 'Passw0rd!',
			role: 'platform_admin',
			clinicId: null,
		},
	];

	let patientUid = '';
	let nutriUid = '';

	console.log('\n👤 Creando usuarios en Firebase Auth y Firestore...');
	for (const u of usersToCreate) {
		try {
			const userRecord = await auth.createUser({
				email: u.email,
				password: u.password,
				emailVerified: true,
			});

			if (u.role === 'patient') patientUid = userRecord.uid;
			if (u.role === 'nutri') nutriUid = userRecord.uid;

			// LÓGICA ESPECIAL PARA EL SUPERUSUARIO BASADA EN setPlatformAdmin.mjs
			if (u.role === 'platform_admin') {
				// 1. Setear el claim exacto
				await auth.setCustomUserClaims(userRecord.uid, {
					platform_admin: true,
				});

				// 2. Escribir en la colección platformAdmins
				await db.collection('platformAdmins').doc(userRecord.uid).set(
					{
						enabled: true,
						grantedAt: new Date().toISOString(),
						grantedBy: 'seed-script',
						projectId: process.env.FIREBASE_PROJECT_ID,
					},
					{ merge: true },
				);

				// 3. Escribir el flag en users
				await db.collection('users').doc(userRecord.uid).set(
					{
						isPlatformAdmin: true,
						email: u.email,
						updatedAt: new Date().toISOString(),
					},
					{ merge: true },
				);

				console.log(`  👑 Creado Superusuario: ${u.email}`);
			} else {
				// Lógica normal para el resto de los roles
				const claims: Record<string, any> = { role: u.role };
				if (u.clinicId) claims.clinicId = u.clinicId;
				await auth.setCustomUserClaims(userRecord.uid, claims);
				console.log(`  ✅ Creado: ${u.email} | Rol: ${u.role}`);
			}
		} catch (error: any) {
			if (error.code === 'auth/email-already-exists') {
				console.log(`  ⚠️ Omitido: ${u.email} (Ya existe en el emulador)`);
			} else {
				console.error(`  ❌ Error creando ${u.email}:`, error);
			}
		}
	}

	console.log('\n📝 Creando documentos de prueba en Firestore...');
	try {
		await db.collection('patients').doc('patient_demo_1').set({
			authUid: patientUid,
			email: 'patient@test.com',
			clinicId: 'clinic_demo_1',
			assignedNutriId: nutriUid,
			firstName: 'Paciente',
			lastName: 'Demo',
			status: 'active',
			createdAt: new Date(),
		});

		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const nextWeek = new Date();
		nextWeek.setDate(nextWeek.getDate() + 7);

		await db.collection('appointments').doc('appt_demo_scheduled').set({
			patientId: 'patient_demo_1',
			nutriId: nutriUid,
			clinicId: 'clinic_demo_1',
			status: 'scheduled',
			date: tomorrow,
			type: 'follow_up',
		});
		await db.collection('appointments').doc('appt_demo_requested').set({
			patientId: 'patient_demo_1',
			nutriId: nutriUid,
			clinicId: 'clinic_demo_1',
			status: 'requested',
			date: nextWeek,
			type: 'first_time',
		});
	} catch (error) {
		console.error('❌ Error escribiendo en Firestore:', error);
	}

	console.log('\n🎉 ¡Seed completado con éxito!');
	process.exit(0);
}

seed().catch(console.error);
