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
	console.log('🌱 Iniciando carga de ecosistema avanzado en el emulador...');

	// 1. DEFINICIÓN DEL CATÁLOGO DE PERSONAS (Base única de identidades)
	const personas = [
		{
			dni: 11111111,
			name: 'Super Admin',
			email: 'super@amsa.com',
			isPlatformAdmin: true,
		},
		{ dni: 22222222, name: 'Dr. Roberto Gómez', email: 'dr.gomez@test.com' },
		{ dni: 33333333, name: 'Lic. Ana Pérez', email: 'lic.perez@test.com' },
		{ dni: 44444444, name: 'Secretaría Laura', email: 'recepcion@test.com' },
		{ dni: 55555555, name: 'Juan Paciente', email: 'paciente.juan@test.com' },
		{ dni: 66666666, name: 'María Paciente', email: 'paciente.maria@test.com' },
	];

	const uids: Record<number, string> = {}; // Para guardar los UIDs generados por DNI

	console.log(
		'\n👤 1. Creando Identidades (Firebase Auth + Colección Users)...',
	);
	for (const p of personas) {
		try {
			const userRecord = await auth.createUser({
				email: p.email,
				password: 'Passw0rd!',
				emailVerified: true,
			});
			uids[p.dni] = userRecord.uid;

			// Guardamos a la persona en la base de datos central (El DNI es su llave lógica)
			await db
				.collection('users')
				.doc(userRecord.uid)
				.set({
					name: p.name,
					email: p.email,
					dni: p.dni,
					isPlatformAdmin: p.isPlatformAdmin ?? false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});

			// Si es SuperAdmin, le damos los superpoderes
			if (p.isPlatformAdmin) {
				await auth.setCustomUserClaims(userRecord.uid, {
					platform_admin: true,
				});
				await db.collection('platformAdmins').doc(userRecord.uid).set({
					enabled: true,
					grantedAt: new Date().toISOString(),
					grantedBy: 'seed-script',
					projectId: process.env.FIREBASE_PROJECT_ID,
				});
				console.log(`  👑 Creado Superusuario: ${p.name} (${p.email})`);
			} else {
				console.log(`  ✅ Creada persona: ${p.name} (DNI: ${p.dni})`);
			}
		} catch (error: any) {
			console.error(`  ❌ Error creando a ${p.email}:`, error?.message);
		}
	}

	console.log('\n🏥 2. Creando Clínicas...');
	const clinicaARef = db.collection('clinics').doc('clinica_a_demo');
	await clinicaARef.set({
		name: 'Centro Médico Los Álamos (Clínica A)',
		createdAt: new Date(),
	});

	const clinicaBRef = db.collection('clinics').doc('clinica_b_demo');
	await clinicaBRef.set({
		name: 'Consultorios del Norte (Clínica B)',
		createdAt: new Date(),
	});
	console.log('  ✅ Clínicas A y B creadas.');

	console.log('\n🔗 3. Asignando Roles y Membresías Cruzadas...');
	const memberships = [
		// Dr. Gómez (DNI 22): Admin en Clínica A, Profesional en Clínica B
		{ uid: uids[22222222], clinicId: 'clinica_a_demo', role: 'clinic_admin' },
		{ uid: uids[22222222], clinicId: 'clinica_b_demo', role: 'professional' },

		// Lic. Pérez (DNI 33): Profesional en Clínica A
		{ uid: uids[33333333], clinicId: 'clinica_a_demo', role: 'professional' },

		// Laura (DNI 44): Staff en ambas clínicas
		{ uid: uids[44444444], clinicId: 'clinica_a_demo', role: 'staff' },
		{ uid: uids[44444444], clinicId: 'clinica_b_demo', role: 'staff' },
	];

	for (const m of memberships) {
		await db.collection('clinic_memberships').add({
			...m,
			isActive: true,
			createdAt: new Date(),
		});
	}
	console.log(
		'  ✅ Membresías asignadas. (Un usuario puede tener múltiples roles/clínicas).',
	);

	console.log('\n🩺 4. Creando Fichas de Pacientes...');
	const pacientes = [
		// Juan se atiende en Clínica A con la Lic. Pérez
		{
			id: 'paciente_juan_a',
			clinicId: 'clinica_a_demo',
			linkedUid: uids[55555555],
			firstName: 'Juan',
			lastName: 'Paciente',
			dni: 55555555,
			assignedNutriId: uids[33333333],
		},
		// María se atiende en Clínica B con el Dr. Gómez
		{
			id: 'paciente_maria_b',
			clinicId: 'clinica_b_demo',
			linkedUid: uids[66666666],
			firstName: 'María',
			lastName: 'Paciente',
			dni: 66666666,
			assignedNutriId: uids[22222222],
		},
		// EL CASO ESTRELLA: La Lic. Pérez es paciente del Dr. Gómez en la Clínica A (Colega y paciente)
		{
			id: 'paciente_ana_perez_a',
			clinicId: 'clinica_a_demo',
			linkedUid: uids[33333333],
			firstName: 'Ana',
			lastName: 'Pérez',
			dni: 33333333,
			assignedNutriId: uids[22222222],
		},
	];

	for (const p of pacientes) {
		await db
			.collection('patients')
			.doc(p.id)
			.set({
				...p,
				status: 'active',
				createdAt: new Date(),
			});
	}
	console.log(
		'  ✅ Fichas de pacientes creadas, incluyendo el caso de un profesional siendo paciente.',
	);

	console.log('\n🎉 ¡Ecosistema generado con éxito!');
	console.log('--------------------------------------------------');
	console.log('Prueba iniciar sesión con:');
	console.log(
		'👉 dr.gomez@test.com (Verás que el selector te deja cambiar entre Clínica A y B)',
	);
	console.log(
		'👉 lic.perez@test.com (Verás el panel de profesional, y si entrás al portal de pacientes, verás su ficha)',
	);
	console.log('👉 super@amsa.com (Para ver todo desde arriba)');
	console.log('--------------------------------------------------');
	process.exit(0);
}

seed().catch(console.error);
