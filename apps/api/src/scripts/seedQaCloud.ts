import 'dotenv/config';

import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdmin } from '../firebase/admin.js';
import { getFirestoreDb } from '../firebase/firestore.js';

type ClinicSeed = {
	id: string;
	name: string;
};

type SeedPerson = {
	key: string;
	name: string;
	email: string;
	dni: number;
};

type MembershipSeed = {
	personKey: string;
	clinicId: string;
	role: 'clinic_admin' | 'professional' | 'staff';
};

type PatientSeed = {
	id: string;
	personKey: string;
	clinicId: string;
	assignedProfessionalKeys: string[];
	portalAccessEnabled: boolean;
	medicalRecordAccessEnabled: boolean;
};

const CONFIRM_VALUE = 'amsa-core-stg';
const PASSWORD = 'Passw0rd!';

const clinics: ClinicSeed[] = [
	{ id: 'qa_cloud_clinic_01', name: 'QA Centro Metabolico Palermo' },
	{ id: 'qa_cloud_clinic_02', name: 'QA Clinica Nutricion Belgrano' },
	{ id: 'qa_cloud_clinic_03', name: 'QA Instituto Salud Integral Norte' },
	{ id: 'qa_cloud_clinic_04', name: 'QA Consultorios Deportivos Sur' },
	{ id: 'qa_cloud_clinic_05', name: 'QA Unidad Bariatrica Oeste' },
];

const personByKey = new Map<string, SeedPerson>();

function addPerson(key: string, name: string, dni: number) {
	const person: SeedPerson = {
		key,
		name,
		dni,
		email: `${key}@qa.amsa.test`,
	};
	personByKey.set(key, person);
	return person;
}

addPerson('qa_cloud_superadmin', 'QA Super Admin Cloud', 91000000);

for (let clinicIndex = 1; clinicIndex <= clinics.length; clinicIndex += 1) {
	addPerson(
		`qa_cloud_c${clinicIndex}_admin`,
		`QA Admin Clinica ${clinicIndex}`,
		91000000 + clinicIndex,
	);

	for (let i = 1; i <= 10; i += 1) {
		addPerson(
			`qa_cloud_c${clinicIndex}_pro_${String(i).padStart(2, '0')}`,
			`QA Profesional ${i} Clinica ${clinicIndex}`,
			91100000 + clinicIndex * 100 + i,
		);
	}

	for (let i = 1; i <= 4; i += 1) {
		addPerson(
			`qa_cloud_c${clinicIndex}_staff_${String(i).padStart(2, '0')}`,
			`QA Staff ${i} Clinica ${clinicIndex}`,
			91200000 + clinicIndex * 100 + i,
		);
	}

	for (let i = 1; i <= 16; i += 1) {
		addPerson(
			`qa_cloud_c${clinicIndex}_patient_${String(i).padStart(2, '0')}`,
			`QA Paciente ${i} Clinica ${clinicIndex}`,
			91300000 + clinicIndex * 100 + i,
		);
	}
}

const sharedPatients = [
	addPerson('qa_cloud_shared_patient_01', 'QA Paciente Compartido Uno', 91400001),
	addPerson('qa_cloud_shared_patient_02', 'QA Paciente Compartido Dos', 91400002),
	addPerson('qa_cloud_shared_patient_03', 'QA Paciente Compartido Tres', 91400003),
	addPerson('qa_cloud_shared_patient_04', 'QA Paciente Compartido Cuatro', 91400004),
];

const memberships: MembershipSeed[] = [];
clinics.forEach((clinic, index) => {
	const clinicNumber = index + 1;
	memberships.push({
		personKey: `qa_cloud_c${clinicNumber}_admin`,
		clinicId: clinic.id,
		role: 'clinic_admin',
	});

	for (let i = 1; i <= 10; i += 1) {
		memberships.push({
			personKey: `qa_cloud_c${clinicNumber}_pro_${String(i).padStart(2, '0')}`,
			clinicId: clinic.id,
			role: 'professional',
		});
	}

	for (let i = 1; i <= 4; i += 1) {
		memberships.push({
			personKey: `qa_cloud_c${clinicNumber}_staff_${String(i).padStart(2, '0')}`,
			clinicId: clinic.id,
			role: 'staff',
		});
	}
});

memberships.push(
	// Profesionales compartidos entre varias clinicas.
	{
		personKey: 'qa_cloud_c1_pro_01',
		clinicId: 'qa_cloud_clinic_02',
		role: 'professional',
	},
	{
		personKey: 'qa_cloud_c2_pro_02',
		clinicId: 'qa_cloud_clinic_03',
		role: 'professional',
	},
	{
		personKey: 'qa_cloud_c3_pro_03',
		clinicId: 'qa_cloud_clinic_04',
		role: 'professional',
	},
	// Staff de una clinica trabajando tambien en otra.
	{
		personKey: 'qa_cloud_c1_staff_01',
		clinicId: 'qa_cloud_clinic_03',
		role: 'staff',
	},
	{
		personKey: 'qa_cloud_c4_staff_02',
		clinicId: 'qa_cloud_clinic_05',
		role: 'staff',
	},
	// Clinic admin de una clinica que es profesional en otra.
	{
		personKey: 'qa_cloud_c1_admin',
		clinicId: 'qa_cloud_clinic_04',
		role: 'professional',
	},
	{
		personKey: 'qa_cloud_c2_admin',
		clinicId: 'qa_cloud_clinic_05',
		role: 'professional',
	},
);

const patientSeeds: PatientSeed[] = [];

clinics.forEach((clinic, index) => {
	const clinicNumber = index + 1;
	for (let i = 1; i <= 16; i += 1) {
		const proA = ((i - 1) % 10) + 1;
		const proB = (i % 10) + 1;
		patientSeeds.push({
			id: `qa_cloud_c${clinicNumber}_patient_${String(i).padStart(2, '0')}`,
			personKey: `qa_cloud_c${clinicNumber}_patient_${String(i).padStart(2, '0')}`,
			clinicId: clinic.id,
			assignedProfessionalKeys:
				i % 5 === 0
					? [
							`qa_cloud_c${clinicNumber}_pro_${String(proA).padStart(2, '0')}`,
							`qa_cloud_c${clinicNumber}_pro_${String(proB).padStart(2, '0')}`,
						]
					: [`qa_cloud_c${clinicNumber}_pro_${String(proA).padStart(2, '0')}`],
			portalAccessEnabled: i % 4 !== 0,
			medicalRecordAccessEnabled: i % 6 === 0,
		});
	}
});

patientSeeds.push(
	// Pacientes compartidos entre clinicas.
	{
		id: 'qa_cloud_shared_patient_01_c1',
		personKey: sharedPatients[0]!.key,
		clinicId: 'qa_cloud_clinic_01',
		assignedProfessionalKeys: ['qa_cloud_c1_pro_01', 'qa_cloud_c1_pro_02'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: true,
	},
	{
		id: 'qa_cloud_shared_patient_01_c2',
		personKey: sharedPatients[0]!.key,
		clinicId: 'qa_cloud_clinic_02',
		assignedProfessionalKeys: ['qa_cloud_c2_pro_01'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: false,
	},
	{
		id: 'qa_cloud_shared_patient_02_c2',
		personKey: sharedPatients[1]!.key,
		clinicId: 'qa_cloud_clinic_02',
		assignedProfessionalKeys: ['qa_cloud_c2_pro_03'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: true,
	},
	{
		id: 'qa_cloud_shared_patient_02_c3',
		personKey: sharedPatients[1]!.key,
		clinicId: 'qa_cloud_clinic_03',
		assignedProfessionalKeys: ['qa_cloud_c3_pro_04'],
		portalAccessEnabled: false,
		medicalRecordAccessEnabled: false,
	},
	{
		id: 'qa_cloud_shared_patient_03_c3',
		personKey: sharedPatients[2]!.key,
		clinicId: 'qa_cloud_clinic_03',
		assignedProfessionalKeys: ['qa_cloud_c3_pro_01'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: false,
	},
	{
		id: 'qa_cloud_shared_patient_03_c4',
		personKey: sharedPatients[2]!.key,
		clinicId: 'qa_cloud_clinic_04',
		assignedProfessionalKeys: ['qa_cloud_c4_pro_02'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: true,
	},
	{
		id: 'qa_cloud_shared_patient_04_c4',
		personKey: sharedPatients[3]!.key,
		clinicId: 'qa_cloud_clinic_04',
		assignedProfessionalKeys: ['qa_cloud_c4_pro_05'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: false,
	},
	{
		id: 'qa_cloud_shared_patient_04_c5',
		personKey: sharedPatients[3]!.key,
		clinicId: 'qa_cloud_clinic_05',
		assignedProfessionalKeys: ['qa_cloud_c5_pro_06'],
		portalAccessEnabled: false,
		medicalRecordAccessEnabled: false,
	},
	// Staff/admin/profesionales que tambien son pacientes en otras clinicas.
	{
		id: 'qa_cloud_staff_c1_patient_c2',
		personKey: 'qa_cloud_c1_staff_01',
		clinicId: 'qa_cloud_clinic_02',
		assignedProfessionalKeys: ['qa_cloud_c2_pro_07'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: true,
	},
	{
		id: 'qa_cloud_staff_c3_patient_c5',
		personKey: 'qa_cloud_c3_staff_02',
		clinicId: 'qa_cloud_clinic_05',
		assignedProfessionalKeys: ['qa_cloud_c5_pro_08'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: false,
	},
	{
		id: 'qa_cloud_admin_c1_patient_c3',
		personKey: 'qa_cloud_c1_admin',
		clinicId: 'qa_cloud_clinic_03',
		assignedProfessionalKeys: ['qa_cloud_c3_pro_09'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: true,
	},
	{
		id: 'qa_cloud_admin_c2_patient_c4',
		personKey: 'qa_cloud_c2_admin',
		clinicId: 'qa_cloud_clinic_04',
		assignedProfessionalKeys: ['qa_cloud_c4_pro_09'],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: false,
	},
);

const balancingPatients = [
	{
		key: 'qa_cloud_c1_patient_17',
		name: 'QA Paciente 17 Clinica 1',
		dni: 91300117,
		clinicId: 'qa_cloud_clinic_01',
		professionalKey: 'qa_cloud_c1_pro_07',
	},
	{
		key: 'qa_cloud_c1_patient_18',
		name: 'QA Paciente 18 Clinica 1',
		dni: 91300118,
		clinicId: 'qa_cloud_clinic_01',
		professionalKey: 'qa_cloud_c1_pro_08',
	},
	{
		key: 'qa_cloud_c1_patient_19',
		name: 'QA Paciente 19 Clinica 1',
		dni: 91300119,
		clinicId: 'qa_cloud_clinic_01',
		professionalKey: 'qa_cloud_c1_pro_09',
	},
	{
		key: 'qa_cloud_c2_patient_17',
		name: 'QA Paciente 17 Clinica 2',
		dni: 91300217,
		clinicId: 'qa_cloud_clinic_02',
		professionalKey: 'qa_cloud_c2_pro_07',
	},
	{
		key: 'qa_cloud_c3_patient_17',
		name: 'QA Paciente 17 Clinica 3',
		dni: 91300317,
		clinicId: 'qa_cloud_clinic_03',
		professionalKey: 'qa_cloud_c3_pro_07',
	},
	{
		key: 'qa_cloud_c4_patient_17',
		name: 'QA Paciente 17 Clinica 4',
		dni: 91300417,
		clinicId: 'qa_cloud_clinic_04',
		professionalKey: 'qa_cloud_c4_pro_07',
	},
	{
		key: 'qa_cloud_c5_patient_17',
		name: 'QA Paciente 17 Clinica 5',
		dni: 91300517,
		clinicId: 'qa_cloud_clinic_05',
		professionalKey: 'qa_cloud_c5_pro_07',
	},
	{
		key: 'qa_cloud_c5_patient_18',
		name: 'QA Paciente 18 Clinica 5',
		dni: 91300518,
		clinicId: 'qa_cloud_clinic_05',
		professionalKey: 'qa_cloud_c5_pro_08',
	},
] as const;

for (const patient of balancingPatients) {
	addPerson(patient.key, patient.name, patient.dni);
	patientSeeds.push({
		id: patient.key,
		personKey: patient.key,
		clinicId: patient.clinicId,
		assignedProfessionalKeys: [patient.professionalKey],
		portalAccessEnabled: true,
		medicalRecordAccessEnabled: false,
	});
}

function requirePerson(key: string) {
	const person = personByKey.get(key);
	if (!person) throw new Error(`Missing seed person ${key}`);
	return person;
}

async function ensureAuthUser(person: SeedPerson) {
	const { auth } = getFirebaseAdmin();
	const desiredUid = person.key;

	try {
		await auth.getUser(desiredUid);
		await auth.updateUser(desiredUid, {
			email: person.email,
			displayName: person.name,
			emailVerified: true,
		});
		return desiredUid;
	} catch (error: any) {
		if (error?.code !== 'auth/user-not-found') throw error;
	}

	try {
		const user = await auth.createUser({
			uid: desiredUid,
			email: person.email,
			displayName: person.name,
			emailVerified: true,
			password: PASSWORD,
		});
		return user.uid;
	} catch (error: any) {
		if (error?.code !== 'auth/email-already-exists') throw error;
		const existing = await auth.getUserByEmail(person.email);
		await auth.updateUser(existing.uid, {
			displayName: person.name,
			emailVerified: true,
			password: PASSWORD,
		});
		return existing.uid;
	}
}

async function seed() {
	if (process.env.SEED_QA_CLOUD_CONFIRM !== CONFIRM_VALUE) {
		throw new Error(
			`Refusing real Firestore writes. Set SEED_QA_CLOUD_CONFIRM=${CONFIRM_VALUE}`,
		);
	}

	delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
	delete process.env.FIRESTORE_EMULATOR_HOST;

	const db = getFirestoreDb();
	const { auth } = getFirebaseAdmin();
	const now = Timestamp.now();
	const uidByPersonKey = new Map<string, string>();

	console.log('[qa-cloud-seed] Creating/updating users...');
	for (const person of personByKey.values()) {
		const uid = await ensureAuthUser(person);
		uidByPersonKey.set(person.key, uid);
		await db.collection('users').doc(uid).set(
			{
				name: person.name,
				displayName: person.name,
				email: person.email,
				dni: person.dni,
				isActive: true,
				qaSeed: true,
				qaSeedKey: person.key,
				updatedAt: now,
				createdAt: now,
			},
			{ merge: true },
		);
	}

	const superUid = uidByPersonKey.get('qa_cloud_superadmin');
	if (!superUid) throw new Error('Missing super admin uid');
	await auth.setCustomUserClaims(superUid, {
		platform_admin: true,
		platformAdmin: true,
	});
	await db.collection('platformAdmins').doc(superUid).set(
		{
			enabled: true,
			isPlatformAdmin: true,
			grantedAt: now,
			grantedBy: 'seedQaCloud',
			qaSeed: true,
		},
		{ merge: true },
	);

	console.log('[qa-cloud-seed] Creating/updating clinics...');
	for (const clinic of clinics) {
		await db.collection('clinics').doc(clinic.id).set(
			{
				name: clinic.name,
				isActive: true,
				branding: {
					accentColor: '#2F8F7B',
					logoUrl: null,
				},
				patientAppointmentSelfService: {
					canCancel: true,
					canReschedule: false,
					minHoursBefore: 24,
				},
				qaSeed: true,
				updatedAt: now,
				createdAt: now,
			},
			{ merge: true },
		);
	}

	console.log('[qa-cloud-seed] Creating/updating memberships...');
	for (const membership of memberships) {
		const uid = uidByPersonKey.get(membership.personKey);
		if (!uid) throw new Error(`Missing uid for ${membership.personKey}`);
		const id = `qa_cloud_${membership.clinicId}_${membership.personKey}`;
		await db.collection('clinic_memberships').doc(id).set(
			{
				clinicId: membership.clinicId,
				uid,
				role: membership.role,
				isActive: true,
				qaSeed: true,
				createdByUid: superUid,
				updatedAt: now,
				createdAt: now,
			},
			{ merge: true },
		);
	}

	console.log('[qa-cloud-seed] Creating/updating patients...');
	for (const patient of patientSeeds) {
		const person = requirePerson(patient.personKey);
		const linkedUid = uidByPersonKey.get(patient.personKey);
		if (!linkedUid) throw new Error(`Missing uid for ${patient.personKey}`);

		const assignedProfessionalUids = patient.assignedProfessionalKeys.map((key) => {
			const uid = uidByPersonKey.get(key);
			if (!uid) throw new Error(`Missing professional uid for ${key}`);
			return uid;
		});

		await db.collection('patients').doc(patient.id).set(
			{
				clinicId: patient.clinicId,
				assignedProfessionalUids,
				userId: linkedUid,
				linkedUid,
				dni: person.dni,
				name: person.name,
				email: person.email,
				phone: `+54 11 ${String(person.dni).slice(0, 4)}-${String(
					person.dni,
				).slice(4, 8)}`,
				status: 'active',
				portalAccessEnabled: patient.portalAccessEnabled,
				medicalRecordAccessEnabled: patient.medicalRecordAccessEnabled,
				qaSeed: true,
				updatedAt: now,
				createdAt: now,
			},
			{ merge: true },
		);
	}

	console.log('[qa-cloud-seed] Creating sample appointments and records...');
	for (const clinic of clinics) {
		const clinicPatients = patientSeeds
			.filter((patient) => patient.clinicId === clinic.id)
			.slice(0, 6);
		for (let i = 0; i < clinicPatients.length; i += 1) {
			const patient = clinicPatients[i]!;
			const personUid = uidByPersonKey.get(patient.personKey);
			const professionalUid = uidByPersonKey.get(patient.assignedProfessionalKeys[0]!);
			if (!personUid || !professionalUid) continue;
			const scheduledFor = Timestamp.fromMillis(
				Date.now() + (i + 1) * 24 * 60 * 60 * 1000,
			);
			await db.collection('appointments').doc(`qa_cloud_appt_${patient.id}`).set(
				{
					clinicId: clinic.id,
					patientId: patient.id,
					patientUid: personUid,
					professionalUid,
					status: i % 3 === 0 ? 'requested' : 'scheduled',
					requestedAt: now,
					scheduledFor: i % 3 === 0 ? null : scheduledFor,
					arrivedAt: null,
					cancelledAt: null,
					cancelledByUid: null,
					cancelledByRole: null,
					completedAt: null,
					completedByUid: null,
					completedByRole: null,
					qaSeed: true,
					updatedAt: now,
					createdAt: now,
				},
				{ merge: true },
			);

			await db.collection('clinical_records').doc(`qa_cloud_record_${patient.id}`).set(
				{
					clinicId: clinic.id,
					patientId: patient.id,
					professionalUid,
					sharedWithProfessionalUids:
						patient.assignedProfessionalKeys.length > 1
							? patient.assignedProfessionalKeys
									.slice(1)
									.map((key) => uidByPersonKey.get(key))
									.filter(Boolean)
							: [],
					type: 'note',
					date: new Date().toISOString(),
					data: {
						title: 'Registro QA',
						note: 'Registro de prueba para validar permisos de fichas.',
					},
					qaSeed: true,
					updatedAt: now,
					createdAt: now,
				},
				{ merge: true },
			);
		}
	}

	console.log('[qa-cloud-seed] Done');
	console.table({
		clinics: clinics.length,
		users: personByKey.size,
		memberships: memberships.length,
		patients: patientSeeds.length,
		password: PASSWORD,
	});
}

seed().catch((error) => {
	console.error('[qa-cloud-seed] Failed', error);
	process.exit(1);
});
