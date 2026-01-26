import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { ClinicDoc, ClinicMembershipDoc } from '../types/clinics.js';

export const createClinicSchema = z.object({
	name: z.string().min(2),
	admin: z.object({
		name: z.string().min(2),
		email: z.string().email(),
		dni: z.string().min(7).max(8),
	}),
});

type CreateClinicInput = z.infer<typeof createClinicSchema>;

export type ClinicSummary = {
	id: string;
	name: string;
	createdAt: ClinicDoc['createdAt'];
	updatedAt: ClinicDoc['updatedAt'];
};

export function mapClinicSummary(id: string, data: ClinicDoc): ClinicSummary {
	return {
		id,
		name: data.name,
		createdAt: data.createdAt,
		updatedAt: data.updatedAt,
	};
}

export async function createClinicWithAdmin({
	db,
	data,
	createdByUid,
}: {
	db: Firestore;
	data: CreateClinicInput;
	createdByUid: string | null;
}): Promise<{ clinic: ClinicSummary; adminUid: string }> {
	const now = Timestamp.now();
	const clinicRef = db.collection('clinics').doc();
	const clinicDoc: ClinicDoc = {
		name: data.name,
		createdAt: now,
		updatedAt: now,
	};

	await clinicRef.set(clinicDoc);

	const dniInt = parseInt(data.admin.dni, 10);

	const userSnap = await db
		.collection('users')
		.where('dni', '==', dniInt)
		.limit(1)
		.get();

	let uid: string;

	if (!userSnap.empty) {
		const userDoc = userSnap.docs[0];
		if (!userDoc) throw new Error('Unexpected null doc');
		uid = userDoc.id;
		await userDoc.ref.update({
			name: data.admin.name,
			email: data.admin.email,
			updatedAt: now,
		});
	} else {
		const newUserRef = db.collection('users').doc();
		uid = newUserRef.id;

		await newUserRef.set({
			email: data.admin.email,
			dni: dniInt,
			name: data.admin.name,
			createdAt: now,
			updatedAt: now,
		});
	}

	const membershipDoc: ClinicMembershipDoc = {
		clinicId: clinicRef.id,
		uid,
		role: 'clinic_admin',
		isActive: true,
		createdAt: now,
		updatedAt: now,
		createdByUid,
	};

	await db.collection('clinic_memberships').add(membershipDoc);

	console.info('[clinics] created clinic', {
		clinicId: clinicRef.id,
		createdByUid,
	});

	return {
		clinic: mapClinicSummary(clinicRef.id, clinicDoc),
		adminUid: uid,
	};
}
