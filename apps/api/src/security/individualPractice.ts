import { getFirestoreDb } from '../firebase/firestore.js';

export async function isIndividualPracticeOwner(
	clinicId: string | null | undefined,
	uid: string | null | undefined,
) {
	if (!clinicId || !uid) return false;
	const snap = await getFirestoreDb().collection('clinics').doc(clinicId).get();
	if (!snap.exists) return false;
	const data = snap.data() as
		| {
				tenantType?: string;
				ownerProfessionalUid?: string | null;
		  }
		| undefined;
	return (
		data?.tenantType === 'individual_practice' &&
		data.ownerProfessionalUid === uid
	);
}

export function effectiveClinicalRole(
	role: string | null | undefined,
	isOwner: boolean,
) {
	return isOwner ? 'professional' : role;
}
