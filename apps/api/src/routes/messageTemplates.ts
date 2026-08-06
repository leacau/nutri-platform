import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { normalizeBilling } from '../billing/plans.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import type { ClinicDoc } from '../types/clinics.js';

type MessageTemplateDoc = {
	clinicId: string;
	name: string;
	channel: 'whatsapp' | 'email';
	body: string;
	createdAt: Timestamp;
	updatedAt: Timestamp;
	createdByUid: string;
};

const router = Router();

const messageTemplateSchema = z.object({
	name: z.string().min(2),
	channel: z.enum(['whatsapp', 'email']),
	body: z.string().min(1),
});

function serializeTemplate(id: string, data: MessageTemplateDoc) {
	return {
		id,
		clinicId: data.clinicId,
		name: data.name,
		channel: data.channel,
		body: data.body,
		createdAt: data.createdAt.toDate().toISOString(),
		updatedAt: data.updatedAt.toDate().toISOString(),
	};
}

async function automatedMessagingEnabled(clinicId: string) {
	const db = getFirestoreDb();
	const snap = await db.collection('clinics').doc(clinicId).get();
	if (!snap.exists) return false;
	const data = snap.data() as Partial<ClinicDoc>;
	const billing = normalizeBilling(
		data.billing,
		data.tenantType === 'individual_practice' ? 'individual' : 'starter_1_5',
	);
	return billing.enabledModules.automatedMessaging === true;
}

async function requireAutomatedMessaging(req: Request, res: Response) {
	const clinicId = req.auth?.clinicId;
	if (!clinicId) {
		res.status(400).json({ success: false, message: 'Missing clinic context' });
		return false;
	}

	if (!(await automatedMessagingEnabled(clinicId))) {
		res.status(402).json({
			success: false,
			message: 'Automated messaging module is not enabled',
		});
		return false;
	}

	return true;
}

router.get(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'professional', 'platform_admin'),
	async (req: Request, res: Response) => {
		if (!(await requireAutomatedMessaging(req, res))) return;

		const clinicId = req.auth!.clinicId!;
		const snap = await getFirestoreDb()
			.collection('message_templates')
			.where('clinicId', '==', clinicId)
			.get();

		const items = snap.docs
			.map((doc) => serializeTemplate(doc.id, doc.data() as MessageTemplateDoc))
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

		return res.status(200).json({ success: true, data: items });
	},
);

router.post(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'staff', 'professional', 'platform_admin'),
	async (req: Request, res: Response) => {
		if (!(await requireAutomatedMessaging(req, res))) return;

		const parsed = messageTemplateSchema.safeParse(req.body ?? {});
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid message template',
				errors: parsed.error.flatten(),
			});
		}

		const now = Timestamp.now();
		const data: MessageTemplateDoc = {
			clinicId: req.auth!.clinicId!,
			name: parsed.data.name,
			channel: parsed.data.channel,
			body: parsed.data.body,
			createdAt: now,
			updatedAt: now,
			createdByUid: req.auth!.uid,
		};
		const ref = await getFirestoreDb().collection('message_templates').add(data);

		return res.status(201).json({
			success: true,
			data: serializeTemplate(ref.id, data),
		});
	},
);

export const messageTemplatesRouter = router;
