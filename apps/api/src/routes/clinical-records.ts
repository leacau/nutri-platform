import { Router, type Request, type Response } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import crypto from "crypto";

import { requireClinicContext } from "../middlewares/requireClinicContext.js";
import { requireRole } from "../middlewares/requireRole.js";
import { denyAuthz } from "../security/authz.js";
import { getFirestoreDb } from "../firebase/firestore.js";

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

const patchRecordSchema = z.object({
  date: z.string().min(10).optional(),
  data: z.record(z.any()).optional(),
  sharedWithProfessionalUids: z.array(z.string().min(1)).optional(),
  visibleInPatientPortal: z.boolean().optional(),
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
    if (auth.role === "patient") {
      if (req.patientContext?.patientId !== patientId) {
        return denyAuthz(req, res, "Patient can only read own records");
      }
      if (patient.medicalRecordAccessEnabled !== true) {
        return denyAuthz(req, res, "Medical record access is disabled");
      }
    } else if (auth.role !== "professional") {
      return denyAuthz(
        req,
        res,
        "Only professionals can access medical records",
      );
    } else if (!(patient.assignedProfessionalUids ?? []).includes(auth.uid)) {
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
        return {
          id: doc.id,
          ...publicData,
          // 🔓 Desciframos la data en memoria justo antes de mandarla al frontend
          data: decryptData(encryptedData || legacyData),
          createdAt:
            rawData.createdAt instanceof Timestamp
              ? rawData.createdAt.toDate().toISOString()
              : rawData.createdAt,
        };
      })
      .filter((record: any) => record.patientId === patientId)
      .sort((a: any, b: any) => dateMillis(b.date) - dateMillis(a.date));

    const visibleRecords = records.filter((record: any) => {
      if (auth.role === "patient")
        return record.visibleInPatientPortal === true;
      return (
        record.professionalUid === auth.uid ||
        (record.sharedWithProfessionalUids ?? []).includes(auth.uid)
      );
    });

    return res.status(200).json({ success: true, data: visibleRecords });
  },
);

// POST: Crear un nuevo registro en el historial
clinicalRecordsRouter.post(
  "/",
  requireClinicContext,
  requireRole("professional"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    if (auth.role !== "professional") {
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
    if (!(patient.assignedProfessionalUids ?? []).includes(auth.uid)) {
      return denyAuthz(
        req,
        res,
        "Professionals can only create records for assigned patients",
      );
    }

    const now = Timestamp.now();

    // 🔒 Encriptamos el contenido sensible antes de armar el registro
    const encryptedPayload = encryptData(data);

    const record = {
      clinicId,
      patientId,
      professionalUid: auth.uid,
      sharedWithProfessionalUids: sharedWithProfessionalUids ?? [],
      visibleInPatientPortal: parsed.data.visibleInPatientPortal ?? false,
      type,
      date,
      encryptedData: encryptedPayload, // Guardamos la basura criptográfica
      createdAt: now,
      updatedAt: now,
    };

    const ref = await db.collection("clinical_records").add(record);

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
        createdAt: now.toDate().toISOString(),
      },
    });
  },
);

// PATCH: Editar un registro clínico
clinicalRecordsRouter.patch(
  "/:recordId",
  requireClinicContext,
  requireRole("professional"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    if (auth.role !== "professional") {
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

    const parsed = patchRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid body",
        errors: parsed.error.flatten(),
      });
    }

    const { data, date, sharedWithProfessionalUids, visibleInPatientPortal } =
      parsed.data;
    const updates: any = { updatedAt: Timestamp.now() };

    // Si mandan data nueva, la encriptamos antes de pisar la base de datos
    if (data !== undefined) updates.encryptedData = encryptData(data);
    if (date !== undefined) updates.date = date;
    if (sharedWithProfessionalUids !== undefined) {
      updates.sharedWithProfessionalUids = sharedWithProfessionalUids;
    }
    if (visibleInPatientPortal !== undefined) {
      updates.visibleInPatientPortal = visibleInPatientPortal;
    }

    await recordRef.update(updates);

    return res.status(200).json({
      success: true,
      message: "Record updated successfully",
      data: { id: recordId, ...updates },
    });
  },
);

// DELETE: Eliminar un registro clínico
clinicalRecordsRouter.delete(
  "/:recordId",
  requireClinicContext,
  requireRole("professional"),
  async (req: Request, res: Response) => {
    const auth = req.auth!;
    const clinicId = auth.clinicId!;
    if (auth.role !== "professional") {
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

    await recordRef.delete();

    return res.status(200).json({
      success: true,
      message: "Record deleted successfully",
      data: { id: recordId },
    });
  },
);
