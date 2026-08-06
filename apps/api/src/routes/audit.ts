import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';

import { getFirestoreDb } from '../firebase/firestore.js';
import { normalizeBilling } from '../billing/plans.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import type { ClinicDoc } from '../types/clinics.js';

export const auditRouter = Router();

function toIso(value: unknown): string | null {
	if (value instanceof Timestamp) return value.toDate().toISOString();
	if (value && typeof (value as any).toDate === 'function') {
		return (value as any).toDate().toISOString();
	}
	return typeof value === 'string' ? value : null;
}

function timestampMillis(value: unknown): number {
	if (value instanceof Timestamp) return value.toMillis();
	if (value && typeof (value as any).toDate === 'function') {
		return (value as any).toDate().getTime();
	}
	if (typeof value === 'string') return Date.parse(value) || 0;
	return 0;
}

auditRouter.get(
	'/',
	requireClinicContext,
	requireRole('clinic_admin'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const db = getFirestoreDb();
		const clinicSnap = await db.collection('clinics').doc(clinicId).get();

		if (!clinicSnap.exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Clinic not found' });
		}

		const clinic = clinicSnap.data() as ClinicDoc;
		const billing = normalizeBilling(clinic.billing, 'starter_1_5');
		if (billing.enabledModules.advancedAudit !== true) {
			return res.status(402).json({
				success: false,
				message: 'Advanced audit module is not enabled',
			});
		}

		const snap = await db
			.collection('audit_logs')
			.where('clinicId', '==', clinicId)
			.limit(1000)
			.get();

		const data = snap.docs
			.map((doc) => ({ doc, item: doc.data() }))
			.sort(
				(a, b) =>
					timestampMillis(b.item.createdAt) -
					timestampMillis(a.item.createdAt),
			)
			.slice(0, 200)
			.map(({ doc, item }) => ({
				id: doc.id,
				clinicId: item.clinicId ?? clinicId,
				patientId: item.patientId ?? null,
				actor: item.actorUid ?? 'system',
				actorRole: item.actorRole ?? 'unknown',
				type: item.actionType ?? 'UNKNOWN',
				createdAt: toIso(item.createdAt),
				detail: item.detail ?? '',
				ipOrigin: item.ipOrigin ?? null,
				userAgent: item.userAgent ?? null,
				hash: item.hash ?? null,
				previousHash: item.previousHash ?? null,
			}));

		return res.status(200).json({ success: true, data });
	},
);
