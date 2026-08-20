import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";

// Esquema de validación para CADA campo dinámico
export const templateFieldSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "El ID solo puede contener letras, números y guiones bajos (ej: peso_actual)",
    ),
  label: z.string().min(1), // Lo que lee el usuario: "Peso Corporal"
  type: z.enum(["number", "text", "select", "formula"]),
  options: z.array(z.string()).optional(), // Solo si el tipo es 'select'
  unit: z.string().optional(), // ej: "kg", "cm", "%"
  required: z.boolean().default(false),
  formula: z.string().optional(), // ej: "{peso} / (({altura}/100) * ({altura}/100))"
  decimals: z.number().optional(), // Cuántos decimales mostrar
  standardMapping: z.string().optional(),
  standardReference: z
    .object({
      id: z.string().min(1),
      name: z.string().min(1),
      unit: z.string().optional(),
      category: z.string().optional(),
      referenceRanges: z.array(
        z.object({
          label: z.string().optional(),
          sex: z.enum(["all", "male", "female", "other"]).optional(),
          ageMin: z.number().nullable().optional(),
          ageMax: z.number().nullable().optional(),
          min: z.number().nullable().optional(),
          max: z.number().nullable().optional(),
          referenceValue: z.number().nullable().optional(),
        }),
      ),
    })
    .optional(),
});

// Esquema para recibir una plantilla nueva desde el Frontend
export const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(templateFieldSchema).min(1, "Debe tener al menos un campo"),
});

// Tipo de TypeScript para guardar en Firestore
export type TemplateField = z.infer<typeof templateFieldSchema>;

export interface MeasurementTemplateDoc {
  clinicId: string;
  name: string;
  description?: string;
  fields: TemplateField[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdByUid: string;
}
