import type { Firestore } from 'firebase-admin/firestore';

export async function getDocInClinic<T extends { clinicId: string }>(
	db: Firestore,
	collection: string,
	docId: string,
	clinicId: string
): Promise<(T & { id: string }) | null> {
	const ref = db.collection(collection).doc(docId);
	const snap = await ref.get();

	if (!snap.exists) return null;

	const data = snap.data() as unknown;

	// Validación mínima hard: si no hay clinicId o no matchea, devolvemos null.
	// Esto evita “adivinar IDs” cross-clinic.
	if (
		typeof data !== 'object' ||
		data === null ||
		!('clinicId' in data) ||
		(data as any).clinicId !== clinicId
	) {
		return null;
	}

	return { ...(data as T), id: snap.id };
}
