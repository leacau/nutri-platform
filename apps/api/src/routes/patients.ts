import { Router, type Request, type Response } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requireClinicContext } from "../middlewares/requireClinicContext.js";
import { requireRole } from "../middlewares/requireRole.js";
import { denyAuthz } from "../security/authz.js";
import { getFirestoreDb } from "../firebase/firestore.js";
import type { PatientDoc } from "../types/patients.js";
import { sanitizePatientForRole } from "../security/patientSanitizer.js";
import { getDocInClinic } from "../security/getDocInClinic.js";
import { logEvent } from "../observability/eventLogger.js";
import type { Role } from "../types/auth.js";
import { pickHighestClinicRole } from "../security/clinicRolePriority.js";
import {
  effectiveClinicalRole,
  isIndividualPracticeOwner,
} from "../security/individualPractice.js";

export const patientsRouter = Router();

async function upsertUserForPatient(
  dni: number,
  name: string,
  email: string | null,
  phone: string | null,
) {
  const db = getFirestoreDb();
  const now = Timestamp.now();

  const existing = await db
    .collection("users")
    .where("dni", "==", dni)
    .limit(1)
    .get();

  if (!existing.empty) {
    const userDoc = existing.docs[0];
    if (!userDoc) throw new Error("Unexpected null doc");
    await userDoc.ref.update({
      name,
      email,
      phone,
      updatedAt: now,
    });
    return userDoc.id;
  }

  const ref = db.collection("users").doc();
  await ref.set({
    name,
    email,
    phone,
    dni,
    createdAt: now,
    updatedAt: now,
  });
  return ref.id;
}

const createPatientSchema = z.object({
  name: z.string().min(2),
  dni: z.string().min(7).max(8),
  email: z.string().email().or(z.literal("")).optional().nullable(),
  phone: z.string().or(z.literal("")).optional().nullable(),
  sexo: z.enum(["male", "female", "other"]).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignedProfessionalUids: z.array(z.string().min(1)).optional().nullable(),
});

const patchPatientSchema = z.object({
  name: z.string().min(2).optional(),
  dni: z.string().min(7).max(8).optional(),
  email: z.string().email().or(z.literal("")).optional().nullable(),
  phone: z.string().or(z.literal("")).optional().nullable(),
  sexo: z.enum(["male", "female", "other"]).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignedProfessionalUids: z.array(z.string().min(1)).optional().nullable(),
  portalAccessEnabled: z.boolean().optional(),
  medicalRecordAccessEnabled: z.boolean().optional(),
  status: z.string().optional(),
});

const assignProfessionalSchema = z.object({
  professionalUid: z.string().min(1).nullable(),
});

const professionalNoteSchema = z.object({
  content: z.string().max(5000).optional().default(""),
});

function clinicScopedUnlessPlatformAdmin(
  req: Request,
  res: Response,
  next: () => void,
) {
  if (req.auth?.isPlatformAdmin) return next();
  return requireClinicContext(req, res, next);
}

patientsRouter.get(
  "/lookup",
  requireClinicContext,
  async (req: Request, res: Response) => {
    const dniVal = parseInt(req.query.dni as string, 10);
    if (isNaN(dniVal))
      return res.status(400).json({ success: false, message: "Invalid DNI" });
    if (dniVal < 1000000 || dniVal > 99999999) {
      return res.status(400).json({
        success: false,
        message: "DNI must be between 1000000 and 99999999",
      });
    }

    const db = getFirestoreDb();

    const snap = await db
      .collection("patients")
      .where("dni", "==", dniVal)
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0]!;
      const data = doc.data() as any;

      const fullName =
        data.name ||
        [data.firstName, data.lastName].filter(Boolean).join(" ") ||
        "";

      return res.status(200).json({
        success: true,
        data: {
          id: doc.id,
          name: fullName,
          email: data.email,
          phone: data.phone,
          sexo: data.sexo ?? null,
          birthDate: data.birthDate ?? null,
          clinicId: data.clinicId,
          assignedProfessionalUids: data.assignedProfessionalUids || [],
        },
      });
    }

    const userSnap = await db
      .collection("users")
      .where("dni", "==", dniVal)
      .limit(1)
      .get();

    if (!userSnap.empty) {
      const uData = userSnap.docs[0]!.data();
      return res.status(200).json({
        success: true,
        data: {
          id: null,
          name: uData.name || "",
          email: uData.email,
          phone: uData.phone,
          sexo: uData.sexo ?? null,
          birthDate: uData.birthDate ?? null,
          clinicId: null,
          assignedProfessionalUids: [],
        },
      });
    }

    return res.status(200).json({ success: true, data: null });
  },
);

patientsRouter.get(
  "/",
  clinicScopedUnlessPlatformAdmin,
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const db = getFirestoreDb();
    let clinicId: string | null = auth.clinicId;

    if (auth.isPlatformAdmin) {
      clinicId =
        req.header("x-clinic-id") ??
        (req.query.clinicId as string | undefined) ??
        null;
      if (!clinicId) {
        return res.status(400).json({
          success: false,
          message: "clinicId is required for platform admin listing",
        });
      }
    }

    if (!clinicId) {
      return denyAuthz(req, res, "Missing clinicId for clinic listing");
    }

    try {
      const query =
        auth.role === "professional"
          ? db
              .collection("patients")
              .where("clinicId", "==", clinicId)
              .where("assignedProfessionalUids", "array-contains", auth.uid)
          : db.collection("patients").where("clinicId", "==", clinicId);

      const snap = await query.limit(100).get();
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as PatientDoc),
      }));

      return res.status(200).json({
        success: true,
        data: items.map((p) =>
          sanitizePatientForRole((auth.role ?? "platform_admin") as Role, p),
        ),
      });
    } catch (error: any) {
      console.warn(
        "[FIRESTORE] Falló la query de pacientes. Usando fallback en memoria temporal.",
        error.message,
      );
      const fallbackSnap = await db
        .collection("patients")
        .where("clinicId", "==", clinicId)
        .get();
      let items = fallbackSnap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as PatientDoc),
      }));

      if (auth.role === "professional") {
        items = items.filter((p) =>
          (p.assignedProfessionalUids || []).includes(auth.uid),
        );
      }

      return res.status(200).json({
        success: true,
        data: items
          .slice(0, 100)
          .map((p) =>
            sanitizePatientForRole((auth.role ?? "platform_admin") as Role, p),
          ),
      });
    }
  },
);

patientsRouter.get(
  "/:id/professional-note",
  requireClinicContext,
  requireRole("professional", "clinic_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const patientId = req.params.id;
    const clinicId = auth.clinicId;
    if (!patientId || !clinicId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing patient context" });
    }

    const db = getFirestoreDb();
    const isOwner = await isIndividualPracticeOwner(clinicId, auth.uid);
    const effectiveRole = effectiveClinicalRole(auth.role, isOwner);
    if (effectiveRole !== "professional") {
      return denyAuthz(req, res, "Only professionals can read private notes");
    }
    const patient = await getDocInClinic<PatientDoc>(
      db,
      "patients",
      patientId,
      clinicId,
    );

    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    if (!(patient.assignedProfessionalUids ?? []).includes(auth.uid) && !isOwner) {
      return denyAuthz(
        req,
        res,
        "Professionals can only read notes for assigned patients",
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        patientId,
        privateProfessionalNote:
          patient.privateProfessionalNotes?.[auth.uid]?.content ?? "",
      },
    });
  },
);

patientsRouter.patch(
  "/:id/professional-note",
  requireClinicContext,
  requireRole("professional", "clinic_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const patientId = req.params.id;
    const clinicId = auth.clinicId;
    if (!patientId || !clinicId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing patient context" });
    }

    const parsed = professionalNoteSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid body",
        errors: parsed.error.flatten(),
      });
    }

    const db = getFirestoreDb();
    const isOwner = await isIndividualPracticeOwner(clinicId, auth.uid);
    const effectiveRole = effectiveClinicalRole(auth.role, isOwner);
    if (effectiveRole !== "professional") {
      return denyAuthz(req, res, "Only professionals can update private notes");
    }
    const patient = await getDocInClinic<PatientDoc>(
      db,
      "patients",
      patientId,
      clinicId,
    );

    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    if (!(patient.assignedProfessionalUids ?? []).includes(auth.uid) && !isOwner) {
      return denyAuthz(
        req,
        res,
        "Professionals can only update notes for assigned patients",
      );
    }

    const content = parsed.data.content.trim();
    await db
      .collection("patients")
      .doc(patientId)
      .set(
        {
          privateProfessionalNotes: {
            [auth.uid]: {
              content,
              updatedAt: Timestamp.now(),
              updatedByUid: auth.uid,
            },
          },
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );

    return res.status(200).json({
      success: true,
      data: { patientId, privateProfessionalNote: content },
    });
  },
);

patientsRouter.get(
  "/:id",
  authMiddleware,
  clinicScopedUnlessPlatformAdmin,
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const patientId = req.params.id;

    if (!patientId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing patient id" });
    }

    const db = getFirestoreDb();
    const snap = await db.collection("patients").doc(patientId).get();

    if (!snap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    const patient = { id: snap.id, ...(snap.data() as PatientDoc) };
    const isOwner = await isIndividualPracticeOwner(patient.clinicId, auth.uid);
    const effectiveRole = effectiveClinicalRole(auth.role, isOwner);

    let isAllowed = false;

    if (auth.isPlatformAdmin) {
      isAllowed = true;
    } else if (
      auth.role === "patient" &&
      req.patientContext?.patientId === patientId &&
      req.patientContext?.clinicId === patient.clinicId
    ) {
      isAllowed = true;
    } else if (
      effectiveRole === "professional" &&
      (patient.assignedProfessionalUids ?? []).includes(auth.uid)
    ) {
      isAllowed = true;
    } else {
      const membershipSnap = await db
        .collection("clinic_memberships")
        .where("clinicId", "==", patient.clinicId)
        .where("uid", "==", auth.uid)
        .where("isActive", "==", true)
        .get();

      if (!membershipSnap.empty) {
        const role = pickHighestClinicRole(
          membershipSnap.docs.map((doc) => doc.data().role),
        );
        if (role && ["clinic_admin", "staff"].includes(role)) {
          isAllowed = true;
        }
      }
    }

    if (!isAllowed) {
      return denyAuthz(
        req,
        res,
        "You do not have permission to view this patient",
      );
    }

    const data = sanitizePatientForRole(
      (auth.role ?? "platform_admin") as Role,
      patient,
    ) as any;

    if (effectiveRole === "professional") {
      data.privateProfessionalNote =
        patient.privateProfessionalNotes?.[auth.uid]?.content ?? "";
    }

    return res.status(200).json({
      success: true,
      data,
    });
  },
);

patientsRouter.post(
  "/",
  requireClinicContext,
  requireRole("clinic_admin", "professional", "staff", "platform_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const parsed = createPatientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid body",
        errors: parsed.error.flatten(),
      });
    }

    const clinicId = auth.clinicId ?? req.header("x-clinic-id") ?? null;
    if (!clinicId) {
      return denyAuthz(
        req,
        res,
        "Missing clinic context when creating patient",
      );
    }

    const db = getFirestoreDb();
    const isOwner = await isIndividualPracticeOwner(clinicId, auth.uid);
    const effectiveRole = effectiveClinicalRole(auth.role, isOwner);
    const dniVal = parseInt(parsed.data.dni, 10);
    if (isNaN(dniVal) || dniVal < 1000000 || dniVal > 99999999) {
      return res.status(400).json({
        success: false,
        message: "DNI must be between 1000000 and 99999999",
      });
    }

    const existingDniSnap = await db
      .collection("patients")
      .where("dni", "==", dniVal)
      .limit(1)
      .get();

    if (!existingDniSnap.empty) {
      const existingDoc = existingDniSnap.docs[0]!;
      const existingData = existingDoc.data() as PatientDoc;
      const userId = await upsertUserForPatient(
        dniVal,
        parsed.data.name,
        parsed.data.email ?? null,
        parsed.data.phone ?? null,
      );

      const updateData: Partial<PatientDoc> = {
        updatedAt: Timestamp.now(),
        userId,
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        sexo: parsed.data.sexo ?? existingData.sexo ?? null,
        birthDate: parsed.data.birthDate || existingData.birthDate || null,
        notes: parsed.data.notes ?? existingData.notes ?? null,
      };

      const existingProfessionals = existingData.assignedProfessionalUids ?? [];
      if (effectiveRole === "professional") {
        updateData.assignedProfessionalUids = Array.from(
          new Set([...existingProfessionals, auth.uid]),
        );
      } else if (parsed.data.assignedProfessionalUids) {
        updateData.assignedProfessionalUids = Array.from(
          new Set([
            ...existingProfessionals,
            ...parsed.data.assignedProfessionalUids,
          ]),
        );
      }

      if (existingData.clinicId !== clinicId) {
        updateData.clinicId = clinicId;
      }

      await existingDoc.ref.update(updateData);

      logEvent("patient_reassigned", {
        req,
        clinicId,
        data: { patientId: existingDoc.id, dni: dniVal },
      });

      return res.status(200).json({
        success: true,
        message:
          "Patient exists. Reassigned to current clinic and professional.",
        data: sanitizePatientForRole((auth.role ?? "platform_admin") as Role, {
          id: existingDoc.id,
          ...existingData,
          ...updateData,
        }),
      });
    }

    const userId = await upsertUserForPatient(
      dniVal,
      parsed.data.name,
      parsed.data.email ?? null,
      parsed.data.phone ?? null,
    );

    const assignedProfessionalUids =
      effectiveRole === "professional"
        ? [auth.uid]
        : (parsed.data.assignedProfessionalUids ?? []);

    const now = Timestamp.now();
    const doc: PatientDoc = {
      clinicId,
      assignedProfessionalUids,
      userId,
      name: parsed.data.name,
      dni: dniVal,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      sexo: parsed.data.sexo ?? null,
      birthDate: parsed.data.birthDate || null,
      notes: parsed.data.notes ?? null,
      linkedUid: null,
      portalAccessEnabled: false,
      medicalRecordAccessEnabled: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    const ref = db.collection("patients").doc();
    await ref.set(doc);

    const created = { id: ref.id, ...doc };
    logEvent("patient_created", { req, clinicId, data: { patientId: ref.id } });

    return res.status(201).json({
      success: true,
      message: "Patient created",
      data: sanitizePatientForRole(
        (auth.role ?? "platform_admin") as Role,
        created,
      ),
    });
  },
);

patientsRouter.patch(
  "/:id",
  clinicScopedUnlessPlatformAdmin,
  requireRole("clinic_admin", "professional", "staff", "platform_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const parsed = patchPatientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid body",
        errors: parsed.error.flatten(),
      });
    }

    const db = getFirestoreDb();
    const clinicIdHeader = auth.isPlatformAdmin
      ? req.header("x-clinic-id")
      : auth.clinicId;
    const clinicId = clinicIdHeader ?? null;
    const patientId = req.params.id;

    if (!patientId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing patient id" });
    }

    let current: (PatientDoc & { id: string }) | null = null;
    if (auth.isPlatformAdmin && clinicId === null) {
      const snap = await db.collection("patients").doc(patientId).get();
      if (snap.exists) {
        current = { id: snap.id, ...(snap.data() as PatientDoc) };
      }
    } else if (clinicId) {
      current = await getDocInClinic<PatientDoc>(
        db,
        "patients",
        patientId,
        clinicId,
      );
    }

    if (!current) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    if (
      auth.role === "professional" &&
      !(current.assignedProfessionalUids ?? []).includes(auth.uid)
    ) {
      return denyAuthz(
        req,
        res,
        "Professionals can only update their assigned patients",
      );
    }

    const update: Partial<PatientDoc> = { updatedAt: Timestamp.now() };
    const nextName = parsed.data.name ?? current.name;
    const nextEmail =
      parsed.data.email !== undefined
        ? parsed.data.email || null
        : current.email;
    const nextPhone =
      parsed.data.phone !== undefined
        ? parsed.data.phone || null
        : current.phone;

    if (parsed.data.name !== undefined) update.name = parsed.data.name;
    if (parsed.data.dni !== undefined) {
      const parsedDni = parseInt(parsed.data.dni, 10);
      if (isNaN(parsedDni) || parsedDni < 1000000 || parsedDni > 99999999) {
        return res.status(400).json({
          success: false,
          message: "DNI must be between 1000000 and 99999999",
        });
      }
      const existingDni = await db
        .collection("patients")
        .where("dni", "==", parsedDni)
        .limit(1)
        .get();
      const conflictingDoc = existingDni.docs.find(
        (doc) => doc.id !== patientId,
      );
      if (conflictingDoc) {
        return res.status(400).json({
          success: false,
          message: "DNI already exists for another patient",
        });
      }
      update.dni = parsedDni;
    }
    if (parsed.data.email !== undefined)
      update.email = parsed.data.email || null;
    if (parsed.data.phone !== undefined)
      update.phone = parsed.data.phone || null;
    if (parsed.data.sexo !== undefined) update.sexo = parsed.data.sexo ?? null;
    if (parsed.data.birthDate !== undefined)
      update.birthDate = parsed.data.birthDate || null;
    if (parsed.data.notes !== undefined)
      update.notes = parsed.data.notes ?? null;

    if (
      parsed.data.portalAccessEnabled !== undefined &&
      ["clinic_admin", "staff", "platform_admin"].includes(
        auth.role ?? "platform_admin",
      )
    ) {
      update.portalAccessEnabled = parsed.data.portalAccessEnabled;
    }

    if (
      parsed.data.medicalRecordAccessEnabled !== undefined &&
      ["clinic_admin", "staff", "platform_admin"].includes(
        auth.role ?? "platform_admin",
      )
    ) {
      update.medicalRecordAccessEnabled =
        parsed.data.medicalRecordAccessEnabled;
    }

    // FIX: Forzamos array si viene nulo para que TypeScript y la Base de Datos estén contentos
    if (parsed.data.assignedProfessionalUids !== undefined) {
      if (auth.role !== "professional") {
        update.assignedProfessionalUids =
          parsed.data.assignedProfessionalUids || [];
      }
    }

    if (parsed.data.status !== undefined && auth.role !== "staff") {
      update.status = parsed.data.status as
        "active" | "inactive" | "discharged";
    }

    if (
      parsed.data.name !== undefined ||
      parsed.data.email !== undefined ||
      parsed.data.phone !== undefined ||
      parsed.data.sexo !== undefined ||
      parsed.data.birthDate !== undefined ||
      parsed.data.dni !== undefined
    ) {
      const dniToUse = update.dni ?? current.dni;
      update.userId = await upsertUserForPatient(
        dniToUse,
        nextName,
        nextEmail,
        nextPhone,
      );
    }

    await db.collection("patients").doc(patientId).update(update);

    const freshSnap = await db.collection("patients").doc(patientId).get();
    const fresh = { id: freshSnap.id, ...(freshSnap.data() as PatientDoc) };

    return res.status(200).json({
      success: true,
      message: "Patient updated",
      data: sanitizePatientForRole(
        (auth.role ?? "platform_admin") as Role,
        fresh,
      ),
    });
  },
);

patientsRouter.post(
  "/:id/assign-professional",
  requireClinicContext,
  requireRole("clinic_admin", "staff", "platform_admin", "professional"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId;
    if (!clinicId)
      return denyAuthz(req, res, "Missing clinic context on assign");

    const patientId = req.params.id;
    if (!patientId)
      return res
        .status(400)
        .json({ success: false, message: "Missing patient id" });

    if (auth.role === "professional") {
      req.body.professionalUid = auth.uid;
    }

    const parsed = assignProfessionalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid body",
        errors: parsed.error.flatten(),
      });
    }

    const db = getFirestoreDb();
    const patient = await getDocInClinic<PatientDoc>(
      db,
      "patients",
      patientId,
      clinicId,
    );
    if (!patient) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found in clinic" });
    }

    const professionalUid = parsed.data.professionalUid;
    if (professionalUid) {
      const membership = await db
        .collection("clinic_memberships")
        .where("clinicId", "==", clinicId)
        .where("uid", "==", professionalUid)
        .where("role", "==", "professional")
        .where("isActive", "==", true)
        .limit(1)
        .get();

      if (membership.empty) {
        return res.status(400).json({
          success: false,
          message:
            "professionalUid is not an active professional in this clinic",
        });
      }
    }

    const updatedProfessionals = professionalUid
      ? Array.from(
          new Set([
            ...(patient.assignedProfessionalUids ?? []),
            professionalUid,
          ]),
        )
      : [];

    await db.collection("patients").doc(patientId).update({
      assignedProfessionalUids: updatedProfessionals,
      updatedAt: Timestamp.now(),
    });

    return res.status(200).json({
      success: true,
      message: "Patient assigned",
      data: { id: patientId, assignedProfessionalUids: updatedProfessionals },
    });
  },
);
