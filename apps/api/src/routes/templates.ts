import { Router, type Request, type Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireClinicContext } from '../middlewares/requireClinicContext.js';
import { requireRole } from '../middlewares/requireRole.js';
import { getFirestoreDb } from '../firebase/firestore.js';
import { denyAuthz } from '../security/authz.js';
import {
	createTemplateSchema,
	type MeasurementTemplateDoc,
} from '../types/templates.js';

const router = Router();

// GET: Obtener todas las plantillas de la clínica
router.get(
	'/',
	authMiddleware,
	requireClinicContext,
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const db = getFirestoreDb();

		const snap = await db
			.collection('measurement_templates')
			.where('clinicId', '==', clinicId)
			.get();

		const items = snap.docs
			.map((d) => ({
				id: d.id,
				...(d.data() as MeasurementTemplateDoc),
			}))
			.filter((item) => item.createdByUid === auth.uid)
			.sort((a, b) => {
				const aMs = a.createdAt?.toMillis?.() ?? 0;
				const bMs = b.createdAt?.toMillis?.() ?? 0;
				return bMs - aMs;
			});

		return res.status(200).json({ success: true, data: items });
	},
);

// POST: Crear una nueva plantilla de mediciones
router.post(
	'/',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'professional'), // Solo ellos pueden crear plantillas
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;

		const parsed = createTemplateSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid template format',
				errors: parsed.error.flatten(),
			});
		}

		const db = getFirestoreDb();
		const now = Timestamp.now();

		const docData: MeasurementTemplateDoc = {
			clinicId,
			name: parsed.data.name,
			description: parsed.data.description || '',
			fields: parsed.data.fields,
			createdAt: now,
			updatedAt: now,
			createdByUid: auth.uid,
		};

		const ref = await db.collection('measurement_templates').add(docData);

		return res.status(201).json({
			success: true,
			message: 'Template created',
			data: { id: ref.id, ...docData },
		});
	},
);

// DELETE: Borrar una plantilla
router.delete(
	'/:id',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const templateId = req.params.id as string;

		const db = getFirestoreDb();
		const ref = db.collection('measurement_templates').doc(templateId);

		const snap = await ref.get();
		if (!snap.exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Template not found' });
		}

		const data = snap.data() as MeasurementTemplateDoc;
		if (data.clinicId !== clinicId) {
			return denyAuthz(req, res, 'Cross-clinic template deletion') as any;
		}

		await ref.delete();

		return res.status(200).json({ success: true, message: 'Template deleted' });
	},
);

// PATCH: Editar una plantilla existente
router.patch(
	'/:id',
	authMiddleware,
	requireClinicContext,
	requireRole('clinic_admin', 'professional'),
	async (req: Request, res: Response) => {
		const auth = req.auth!;
		const clinicId = auth.clinicId!;
		const templateId = req.params.id as string;

		const db = getFirestoreDb();
		const ref = db.collection('measurement_templates').doc(templateId);

		const snap = await ref.get();
		if (!snap.exists) {
			return res
				.status(404)
				.json({ success: false, message: 'Template not found' });
		}

		const data = snap.data() as MeasurementTemplateDoc;
		if (data.clinicId !== clinicId) {
			return denyAuthz(req, res, 'Cross-clinic template update') as any;
		}

		const parsed = createTemplateSchema.safeParse(req.body);
		if (!parsed.success) {
			return res.status(400).json({
				success: false,
				message: 'Invalid template format',
				errors: parsed.error.flatten(),
			});
		}

		const now = Timestamp.now();
		const updates = {
			name: parsed.data.name,
			description: parsed.data.description || '',
			fields: parsed.data.fields,
			updatedAt: now,
		};

		await ref.update(updates);

		return res.status(200).json({ success: true, message: 'Template updated' });
	},
);

export const templatesRouter = router;
