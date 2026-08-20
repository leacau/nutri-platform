import { Router, type Request, type Response } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireClinicContext } from "../middlewares/requireClinicContext.js";
import { requireRole } from "../middlewares/requireRole.js";
import { denyAuthz } from "../security/authz.js";
import { getFirestoreDb } from "../firebase/firestore.js";

const referenceRangeSchema = z
  .object({
    label: z.string().max(120).optional().default(""),
    sex: z.enum(["all", "male", "female", "other"]).optional().default("all"),
    ageMin: z.number().min(0).max(130).nullable().optional(),
    ageMax: z.number().min(0).max(130).nullable().optional(),
    min: z.number().nullable().optional(),
    max: z.number().nullable().optional(),
    referenceValue: z.number().nullable().optional(),
  })
  .refine(
    (range) =>
      range.min != null ||
      range.max != null ||
      range.referenceValue != null,
    "At least one reference value is required",
  );

const standardSchema = z.object({
  name: z.string().min(2).max(120),
  unit: z.string().max(24).optional().default(""),
  category: z.string().max(80).optional().default(""),
  description: z.string().max(1000).optional().default(""),
  referenceRanges: z.array(referenceRangeSchema).min(1).max(50),
  isActive: z.boolean().optional().default(true),
});

type MeasurementStandardDoc = z.infer<typeof standardSchema> & {
  clinicId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUid: string;
  updatedByUid: string;
};

export const measurementStandardsRouter = Router();

measurementStandardsRouter.get(
  "/",
  authMiddleware,
  requireClinicContext,
  requireRole("clinic_admin", "professional", "staff", "platform_admin"),
  async (req: Request, res: Response) => {
    const clinicId = req.auth!.clinicId!;
    const db = getFirestoreDb();
    const snap = await db
      .collection("measurement_standards")
      .where("clinicId", "==", clinicId)
      .where("isActive", "==", true)
      .get();

    const items = snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as MeasurementStandardDoc) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));

    return res.status(200).json({ success: true, data: items });
  },
);

measurementStandardsRouter.post(
  "/",
  authMiddleware,
  requireClinicContext,
  requireRole("clinic_admin", "professional", "platform_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    const parsed = standardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid measurement standard",
        errors: parsed.error.flatten(),
      });
    }

    const now = Timestamp.now();
    const doc: MeasurementStandardDoc = {
      clinicId,
      ...parsed.data,
      createdAt: now,
      updatedAt: now,
      createdByUid: auth.uid,
      updatedByUid: auth.uid,
    };
    const ref = await getFirestoreDb().collection("measurement_standards").add(doc);

    return res.status(201).json({
      success: true,
      message: "Measurement standard created",
      data: { id: ref.id, ...doc },
    });
  },
);

measurementStandardsRouter.patch(
  "/:id",
  authMiddleware,
  requireClinicContext,
  requireRole("clinic_admin", "professional", "platform_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    const standardId = req.params.id;
    if (!standardId) {
      return res.status(400).json({ success: false, message: "Missing id" });
    }

    const parsed = standardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid measurement standard",
        errors: parsed.error.flatten(),
      });
    }

    const db = getFirestoreDb();
    const ref = db.collection("measurement_standards").doc(standardId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const current = snap.data() as MeasurementStandardDoc;
    if (current.clinicId !== clinicId) {
      return denyAuthz(req, res, "Cross-clinic measurement standard update");
    }

    const update = {
      ...parsed.data,
      updatedAt: Timestamp.now(),
      updatedByUid: auth.uid,
    };
    await ref.update(update);

    return res.status(200).json({
      success: true,
      message: "Measurement standard updated",
      data: { id: standardId, ...current, ...update },
    });
  },
);

measurementStandardsRouter.delete(
  "/:id",
  authMiddleware,
  requireClinicContext,
  requireRole("clinic_admin", "professional", "platform_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    const standardId = req.params.id;
    if (!standardId) {
      return res.status(400).json({ success: false, message: "Missing id" });
    }

    const db = getFirestoreDb();
    const ref = db.collection("measurement_standards").doc(standardId);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    const current = snap.data() as MeasurementStandardDoc;
    if (current.clinicId !== clinicId) {
      return denyAuthz(req, res, "Cross-clinic measurement standard deletion");
    }

    await ref.update({
      isActive: false,
      updatedAt: Timestamp.now(),
      updatedByUid: auth.uid,
    });

    return res.status(200).json({ success: true, message: "Measurement standard deleted" });
  },
);
