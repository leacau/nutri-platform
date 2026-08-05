import { Router, type Request, type Response } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import crypto from "crypto";

import { requireClinicContext } from "../middlewares/requireClinicContext.js";
import { requireRole } from "../middlewares/requireRole.js";
import { denyAuthz } from "../security/authz.js";
import { getFirestoreDb } from "../firebase/firestore.js";
import { writeAuditLog } from "../observability/eventLogger.js";
import {
  effectiveClinicalRole,
  isIndividualPracticeOwner,
} from "../security/individualPractice.js";

export const clinicalRecordsRouter = Router();

// ============================================================================
// 🔒 MOTOR DE ENCRIPTACIÓN AES-256-GCM (Grado Médico)
// ============================================================================
// ATENCIÓN: En producción, ESTA CLAVE DEBE VENIR DEL .env (process.env.CLINICAL_ENCRYPTION_KEY)
// Debe ser exactamente de 32 bytes (256 bits). Para este código usamos un fallback seguro.
const getEncryptionKey = () => {
  const configuredKey = process.env.CLINICAL_ENCRYPTION_KEY?.trim();
  if (configuredKey) {
    if (/^[a-f0-9]{64}$/i.test(configuredKey)) {
      return Buffer.from(configuredKey, "hex");
    }
    return crypto.scryptSync(configuredKey, "clinical-records", 32);
  }
  // Fallback de desarrollo: Genera una clave a partir de un string estático
  return crypto.scryptSync("nutri_platform_super_secret_dev_key", "salt", 32);
};

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const CLINICAL_RECORD_UNDER_REVIEW_NOTICE =
  "Registro bajo revisión y verificación de exactitud";

function encryptData(data: any): string {
  const text = JSON.stringify(data);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  // Guardamos el Vector de Inicialización, el Tag de Autenticación y el texto cifrado
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decryptData(encryptedText: string | any): any {
  // Si la data no es un string (es un registro viejo sin cifrar), la devolvemos como está
  if (typeof encryptedText !== "string" || !encryptedText.includes(":")) {
    return encryptedText;
  }

  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;

    // Le juramos a TypeScript que estas variables son strings
    const ivHex = parts[0] as string;
    const authTagHex = parts[1] as string;
    const encryptedHex = parts[2] as string;

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);

    // Tipamos explícitamente como string para evitar el error de NonSharedBuffer
    let decrypted: string = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  } catch (error) {
    console.error("Error crítico descifrando registro médico:", error);
    return {
      error: "DATA_CORRUPTED_OR_KEY_MISMATCH",
      content: "No se pudo descifrar el registro.",
    };
  }
}

function dateMillis(value: any): number {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value._seconds === "number") return value._seconds * 1000;
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
    .join(",")}}`;
}

function timestampMillis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof (value as any).toMillis === "function")
    return (value as any).toMillis();
  if (value && typeof (value as any)._seconds === "number")
    return (value as any)._seconds * 1000;
  return Date.now();
}

function computeClinicalRecordHash(input: {
  recordId: string;
  createdAt: Timestamp;
  professionalUid: string;
  encryptedData: string;
  previousHash: string | null;
}) {
  return crypto
    .createHash("sha256")
    .update(
      stableStringify({
        recordId: input.recordId,
        createdAt: input.createdAt.toMillis(),
        professionalUid: input.professionalUid,
        encryptedData: input.encryptedData,
        previousHash: input.previousHash,
      }),
    )
    .digest("hex");
}

async function latestPatientClinicalHash(
  clinicId: string,
  patientId: string,
): Promise<string | null> {
  const db = getFirestoreDb();
  const snap = await db
    .collection("clinical_records")
    .where("clinicId", "==", clinicId)
    .where("patientId", "==", patientId)
    .get();
  const latest = snap.docs
    .map((doc) => doc.data())
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt))[0];
  return latest?.hash ?? null;
}

// Validación estricta para garantizar la estructura de los datos
const createRecordSchema = z.object({
  patientId: z.string().min(1),
  type: z.enum([
    "note",
    "measurement",
    "dynamic_measurement",
    "prescription",
    "meal_plan",
    "attachment",
  ]),
  date: z.string().min(10),
  data: z.record(z.any()), // Este es el objeto que vamos a encriptar
  sharedWithProfessionalUids: z.array(z.string().min(1)).optional(),
  visibleInPatientPortal: z.boolean().optional(),
});

const patchRecordMetadataSchema = z.object({
  sharedWithProfessionalUids: z.array(z.string().min(1)).optional(),
  visibleInPatientPortal: z.boolean().optional(),
});

const rectifyRecordSchema = z.object({
  date: z.string().min(10),
  data: z.record(z.any()),
  reason: z.string().min(8),
  visibleInPatientPortal: z.boolean().optional(),
  sharedWithProfessionalUids: z.array(z.string().min(1)).optional(),
});

const blockRecordSchema = z.object({
  reason: z.string().min(8).optional(),
});

// GET: Obtener todos los registros de un paciente en una clínica
clinicalRecordsRouter.get(
  "/patient/:patientId",
  requireClinicContext,
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    const { patientId } = req.params;

    if (!patientId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing patient ID" });
    }

    const db = getFirestoreDb();
    const isOwner = await isIndividualPracticeOwner(clinicId, auth.uid);
    const effectiveRole = effectiveClinicalRole(auth.role, isOwner);

    const patientSnap = await db.collection("patients").doc(patientId).get();
    if (!patientSnap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found" });
    }

    if (patientSnap.data()?.clinicId !== clinicId) {
      return denyAuthz(req, res, "Cross-clinic access denied");
    }

    // 🔒 REGLA DE HIERRO: Solo traemos los registros donde professionalUid == tu UID.
    // No importa si sos clinic_admin o superuser, la consulta en Firebase filtra por tu ID.
    const patient = { id: patientSnap.id, ...(patientSnap.data() as any) };
    if (effectiveRole === "patient") {
      if (req.patientContext?.patientId !== patientId) {
        return denyAuthz(req, res, "Patient can only read own records");
      }
      if (patient.medicalRecordAccessEnabled !== true) {
        return denyAuthz(req, res, "Medical record access is disabled");
      }
    } else if (effectiveRole !== "professional") {
      return denyAuthz(
        req,
        res,
        "Only professionals can access medical records",
      );
    } else if (
      !(patient.assignedProfessionalUids ?? []).includes(auth.uid) &&
      !isOwner
    ) {
      return denyAuthz(
        req,
        res,
        "Professionals can only read assigned patients",
      );
    }

    const recordsSnap = await db
      .collection("clinical_records")
      .where("clinicId", "==", clinicId)
      .get();

    const records = recordsSnap.docs
      .map((doc) => {
        const rawData = doc.data();
        const { encryptedData, data: legacyData, ...publicData } = rawData;
        const isBlockedForViewer =
          rawData.status === "blocked" && rawData.professionalUid !== auth.uid;
        return {
          id: doc.id,
          ...publicData,
          // 🔓 Desciframos la data en memoria justo antes de mandarla al frontend
          data: isBlockedForViewer
            ? { notice: CLINICAL_RECORD_UNDER_REVIEW_NOTICE }
            : decryptData(encryptedData || legacyData),
          createdAt:
            rawData.createdAt instanceof Timestamp
              ? rawData.createdAt.toDate().toISOString()
              : rawData.createdAt,
        };
      })
      .filter((record: any) => record.patientId === patientId)
      .sort((a: any, b: any) => dateMillis(b.date) - dateMillis(a.date));

    const visibleRecords = records.filter((record: any) => {
      if (effectiveRole === "patient")
        return record.visibleInPatientPortal === true;
      return (
        record.professionalUid === auth.uid ||
        (record.sharedWithProfessionalUids ?? []).includes(auth.uid)
      );
    });

    await writeAuditLog({
      req,
      clinicId,
      patientId,
      actionType: "CLINICAL_RECORD_READ",
      detail: `Lectura de historia clínica del paciente ${patientId}`,
      data: {
        returnedRecords: visibleRecords.length,
        viewerRole: auth.role,
      },
    });

    return res.status(200).json({ success: true, data: visibleRecords });
  },
);

// POST: Crear un nuevo registro en el historial
clinicalRecordsRouter.post(
  "/",
  requireClinicContext,
  requireRole("professional", "clinic_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    const isOwner = await isIndividualPracticeOwner(clinicId, auth.uid);
    const effectiveRole = effectiveClinicalRole(auth.role, isOwner);
    if (effectiveRole !== "professional") {
      return denyAuthz(
        req,
        res,
        "Only professionals can create medical records",
      );
    }

    const parsed = createRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid body",
        errors: parsed.error.flatten(),
      });
    }

    const { patientId, type, date, data, sharedWithProfessionalUids } =
      parsed.data;
    const db = getFirestoreDb();

    const patientSnap = await db.collection("patients").doc(patientId).get();
    if (!patientSnap.exists || patientSnap.data()?.clinicId !== clinicId) {
      return res
        .status(404)
        .json({ success: false, message: "Patient not found in clinic" });
    }

    const patient = patientSnap.data() as any;
    if (!(patient.assignedProfessionalUids ?? []).includes(auth.uid) && !isOwner) {
      return denyAuthz(
        req,
        res,
        "Professionals can only create records for assigned patients",
      );
    }

    const now = Timestamp.now();

    const encryptedPayload = encryptData(data);
    const ref = db.collection("clinical_records").doc();
    const previousHash = await latestPatientClinicalHash(clinicId, patientId);
    const hash = computeClinicalRecordHash({
      recordId: ref.id,
      createdAt: now,
      professionalUid: auth.uid,
      encryptedData: encryptedPayload,
      previousHash,
    });

    const record = {
      clinicId,
      patientId,
      professionalUid: auth.uid,
      sharedWithProfessionalUids: sharedWithProfessionalUids ?? [],
      visibleInPatientPortal: parsed.data.visibleInPatientPortal ?? false,
      status: "active",
      type,
      date,
      encryptedData: encryptedPayload,
      previousHash,
      hash,
      createdAt: now,
      updatedAt: now,
    };

    await ref.set(record);

    await writeAuditLog({
      req,
      clinicId,
      patientId,
      actionType: "CLINICAL_RECORD_CREATED",
      detail: `Creaci?n de asiento cl?nico ${ref.id}`,
      data: {
        recordId: ref.id,
        type,
        hash,
        previousHash,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Record created successfully",
      // Devolvemos la data original al frontend (no la encriptada) para que no haya que recargar
      data: {
        id: ref.id,
        clinicId,
        patientId,
        professionalUid: auth.uid,
        type,
        date,
        data,
        visibleInPatientPortal: parsed.data.visibleInPatientPortal ?? false,
        status: "active",
        previousHash,
        hash,
        createdAt: now.toDate().toISOString(),
      },
    });
  },
);

// PATCH: Editar un registro clínico
clinicalRecordsRouter.patch(
  "/:recordId",
  requireClinicContext,
  requireRole("professional", "clinic_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    const isOwner = await isIndividualPracticeOwner(clinicId, auth.uid);
    const effectiveRole = effectiveClinicalRole(auth.role, isOwner);
    if (effectiveRole !== "professional") {
      return denyAuthz(
        req,
        res,
        "Only professionals can update medical records",
      );
    }
    const { recordId } = req.params;

    if (!recordId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing record ID" });
    }

    const db = getFirestoreDb();
    const recordRef = db.collection("clinical_records").doc(recordId);
    const recordSnap = await recordRef.get();

    if (!recordSnap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });
    }

    const recordData = recordSnap.data()!;

    if (recordData.clinicId !== clinicId) {
      return denyAuthz(req, res, "Cross-clinic edit attempt denied");
    }

    // 🔒 REGLA DE HIERRO: Nadie puede editar si no es el creador original
    if (recordData.professionalUid !== auth.uid) {
      return denyAuthz(
        req,
        res,
        "Nadie puede editar un registro que no haya firmado personalmente.",
      );
    }

    if ("data" in req.body || "date" in req.body) {
      return res.status(409).json({
        success: false,
        message:
          "Los asientos clínicos son inalterables. Usá /rectifications para corregir el contenido.",
      });
    }

    const parsed = patchRecordMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid body",
        errors: parsed.error.flatten(),
      });
    }

    const { sharedWithProfessionalUids, visibleInPatientPortal } = parsed.data;
    const updates: any = { updatedAt: Timestamp.now() };

    if (sharedWithProfessionalUids !== undefined) {
      updates.sharedWithProfessionalUids = sharedWithProfessionalUids;
    }
    if (visibleInPatientPortal !== undefined) {
      updates.visibleInPatientPortal = visibleInPatientPortal;
    }

    await recordRef.update(updates);

    await writeAuditLog({
      req,
      clinicId,
      patientId: recordData.patientId ?? null,
      actionType: "CLINICAL_RECORD_METADATA_UPDATED",
      detail: `Actualización de metadatos del asiento clínico ${recordId}`,
      data: {
        recordId,
        updatedFields: Object.keys(updates).filter((key) => key !== "updatedAt"),
      },
    });

    return res.status(200).json({
      success: true,
      message: "Record updated successfully",
      data: { id: recordId, ...updates },
    });
  },
);
clinicalRecordsRouter.post(
  "/:recordId/rectifications",
  requireClinicContext,
  requireRole("professional", "clinic_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    const isOwner = await isIndividualPracticeOwner(clinicId, auth.uid);
    const effectiveRole = effectiveClinicalRole(auth.role, isOwner);
    if (effectiveRole !== "professional") {
      return denyAuthz(
        req,
        res,
        "Only professionals can rectify medical records",
      );
    }
    const { recordId } = req.params;

    if (!recordId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing record ID" });
    }

    const parsed = rectifyRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid body",
        errors: parsed.error.flatten(),
      });
    }

    const db = getFirestoreDb();
    const originalRef = db.collection("clinical_records").doc(recordId);
    const originalSnap = await originalRef.get();

    if (!originalSnap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });
    }

    const original = originalSnap.data()!;
    if (original.clinicId !== clinicId) {
      return denyAuthz(req, res, "Cross-clinic rectification attempt denied");
    }
    if (original.professionalUid !== auth.uid) {
      return denyAuthz(
        req,
        res,
        "S?lo el profesional firmante puede rectificar este asiento.",
      );
    }

    const now = Timestamp.now();
    const encryptedPayload = encryptData(parsed.data.data);
    const ref = db.collection("clinical_records").doc();
    const previousHash = await latestPatientClinicalHash(
      clinicId,
      original.patientId,
    );
    const hash = computeClinicalRecordHash({
      recordId: ref.id,
      createdAt: now,
      professionalUid: auth.uid,
      encryptedData: encryptedPayload,
      previousHash,
    });

    const rectifiedRecord = {
      clinicId,
      patientId: original.patientId,
      professionalUid: auth.uid,
      sharedWithProfessionalUids:
        parsed.data.sharedWithProfessionalUids ??
        original.sharedWithProfessionalUids ??
        [],
      visibleInPatientPortal:
        parsed.data.visibleInPatientPortal ??
        original.visibleInPatientPortal ??
        false,
      status: "active",
      type: original.type,
      date: parsed.data.date,
      encryptedData: encryptedPayload,
      correctionOfRecordId: recordId,
      correctionReason: parsed.data.reason,
      previousHash,
      hash,
      createdAt: now,
      updatedAt: now,
    };

    await db.runTransaction(async (tx) => {
      tx.set(ref, rectifiedRecord);
      tx.update(originalRef, {
        status: "error_rectified",
        rectifiedByRecordId: ref.id,
        rectifiedAt: now,
        rectifiedByUid: auth.uid,
        rectificationReason: parsed.data.reason,
        updatedAt: now,
      });
    });

    await writeAuditLog({
      req,
      clinicId,
      patientId: original.patientId,
      actionType: "CLINICAL_RECORD_RECTIFIED",
      detail: "Rectificaci?n aditiva del asiento cl?nico " + recordId,
      data: {
        originalRecordId: recordId,
        rectifiedByRecordId: ref.id,
        reason: parsed.data.reason,
        hash,
        previousHash,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Record rectified with additive entry",
      data: {
        id: ref.id,
        ...rectifiedRecord,
        data: parsed.data.data,
        createdAt: now.toDate().toISOString(),
        updatedAt: now.toDate().toISOString(),
      },
    });
  },
);


clinicalRecordsRouter.post(
  "/:recordId/export-events",
  requireClinicContext,
  requireRole("professional", "clinic_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    const { recordId } = req.params;
    if (!recordId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing record ID" });
    }
    const db = getFirestoreDb();
    const recordSnap = await db.collection("clinical_records").doc(recordId).get();

    if (!recordSnap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });
    }

    const recordData = recordSnap.data()!;
    if (recordData.clinicId !== clinicId) {
      return denyAuthz(req, res, "Cross-clinic export attempt denied");
    }

    await writeAuditLog({
      req,
      clinicId,
      patientId: recordData.patientId ?? null,
      actionType: "CLINICAL_RECORD_EXPORTED",
      detail: "Exportaci?n o impresi?n del asiento cl?nico " + recordId,
      data: {
        recordId,
        type: recordData.type,
        actorRole: auth.role,
      },
    });

    return res.status(200).json({
      success: true,
      data: { id: recordId, logged: true },
    });
  },
);

// DELETE: Eliminar un registro clínico
clinicalRecordsRouter.delete(
  "/:recordId",
  requireClinicContext,
  requireRole("professional", "clinic_admin"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    const isOwner = await isIndividualPracticeOwner(clinicId, auth.uid);
    const effectiveRole = effectiveClinicalRole(auth.role, isOwner);
    if (effectiveRole !== "professional") {
      return denyAuthz(
        req,
        res,
        "Only professionals can delete medical records",
      );
    }
    const { recordId } = req.params;

    if (!recordId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing record ID" });
    }

    const db = getFirestoreDb();
    const recordRef = db.collection("clinical_records").doc(recordId);
    const recordSnap = await recordRef.get();

    if (!recordSnap.exists) {
      return res
        .status(404)
        .json({ success: false, message: "Record not found" });
    }

    const recordData = recordSnap.data()!;

    if (recordData.clinicId !== clinicId) {
      return denyAuthz(req, res, "Cross-clinic delete attempt denied");
    }

    // 🔒 REGLA DE HIERRO: Nadie puede borrar si no es el creador original
    if (recordData.professionalUid !== auth.uid) {
      return denyAuthz(
        req,
        res,
        "Nadie puede borrar un registro que no haya firmado personalmente.",
      );
    }

    const parsed = blockRecordSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid body",
        errors: parsed.error.flatten(),
      });
    }

    const now = Timestamp.now();
    const blockReason =
      parsed.data.reason ??
      "Bloqueo preventivo solicitado desde interfaz profesional.";

    await recordRef.update({
      status: "blocked",
      blockedAt: now,
      blockedByUid: auth.uid,
      blockReason,
      updatedAt: now,
    });

    await writeAuditLog({
      req,
      clinicId,
      patientId: recordData.patientId ?? null,
      actionType: "CLINICAL_RECORD_BLOCKED",
      detail: `Bloqueo lógico del asiento clínico ${recordId}`,
      data: {
        recordId,
        reason: blockReason,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Record blocked logically",
      data: { id: recordId, status: "blocked" },
    });
  },
);
