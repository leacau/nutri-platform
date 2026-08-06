"use client";

import { Calculator, Loader2, Paperclip, Plus } from "lucide-react";
import { ClinicalRecord, apiClient } from "../../../../../../lib/api-client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../../../../components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../../../../../components/ui/tabs";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "../../../../../../components/ui/button";
import { Input } from "../../../../../../components/ui/input";
import { Label } from "../../../../../../components/ui/label";
import { MeasurementTemplate } from "../../../../../../lib/types";
import { Select } from "../../../../../../components/ui/select";
import { Textarea } from "../../../../../../components/ui/textarea";
import { getFirebaseApp } from "../../../../../../lib/firebase";
import { useAuth } from "../../../../../../providers/auth-provider";
import { useAuthedQuery } from "../../../../../../hooks/use-authed-query";
import { useClinic } from "../../../../../../providers/clinic-provider";
import { useI18n } from "../../../../../../providers/i18n-provider";
import { useState } from "react";

type RecordType =
  | "note"
  | "measurement"
  | "dynamic_measurement" // NUEVO: Tipo para plantillas
  | "prescription"
  | "meal_plan"
  | "attachment";

type DailyMeals = {
  breakfast: string;
  lunch: string;
  snack: string;
  dinner: string;
};
const emptyDay = (): DailyMeals => ({
  breakfast: "",
  lunch: "",
  snack: "",
  dinner: "",
});
const DAYS_OF_WEEK = [
  { key: "monday", label: "Lu" },
  { key: "tuesday", label: "Ma" },
  { key: "wednesday", label: "Mi" },
  { key: "thursday", label: "Ju" },
  { key: "friday", label: "Vi" },
  { key: "saturday", label: "Sá" },
  { key: "sunday", label: "Do" },
] as const;

function RecordForm({
  patientId,
  recordToEdit,
  open,
  onOpenChange,
}: {
  patientId: string;
  recordToEdit?: ClinicalRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEditing = !!recordToEdit;

  const [type, setType] = useState<RecordType>(
    recordToEdit ? (recordToEdit.type as RecordType) : "note",
  );
  const [date, setDate] = useState(
    recordToEdit
      ? recordToEdit.date.slice(0, 16)
      : new Date().toISOString().slice(0, 16),
  );
  const [visibleInPatientPortal, setVisibleInPatientPortal] = useState(
    recordToEdit?.visibleInPatientPortal === true,
  );
  const [rectificationReason, setRectificationReason] = useState("");

  const [noteContent, setNoteContent] = useState(
    recordToEdit?.type === "note" ? recordToEdit.data.content : "",
  );
  const [measurements, setMeasurements] = useState({
    weight:
      recordToEdit?.type === "measurement" && recordToEdit.data.weight
        ? String(recordToEdit.data.weight)
        : "",
    height:
      recordToEdit?.type === "measurement" && recordToEdit.data.height
        ? String(recordToEdit.data.height)
        : "",
    bloodPressureSystolic:
      recordToEdit?.type === "measurement" &&
      recordToEdit.data.bloodPressureSystolic
        ? String(recordToEdit.data.bloodPressureSystolic)
        : "",
    bloodPressureDiastolic:
      recordToEdit?.type === "measurement" &&
      recordToEdit.data.bloodPressureDiastolic
        ? String(recordToEdit.data.bloodPressureDiastolic)
        : "",
    heartRate:
      recordToEdit?.type === "measurement" && recordToEdit.data.heartRate
        ? String(recordToEdit.data.heartRate)
        : "",
  });

  // NUEVO: Estados para las plantillas dinámicas
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    recordToEdit?.type === "dynamic_measurement"
      ? recordToEdit.data.templateId
      : "",
  );
  const [dynamicValues, setDynamicValues] = useState<Record<string, string>>(
    recordToEdit?.type === "dynamic_measurement"
      ? recordToEdit.data.values
      : {},
  );

  const [prescriptionContent, setPrescriptionContent] = useState(
    recordToEdit?.type === "prescription" ? recordToEdit.data.content : "",
  );

  const [mealPlanMode, setMealPlanMode] = useState<"free_text" | "weekly">(
    recordToEdit?.type === "meal_plan" ? recordToEdit.data.mode : "free_text",
  );
  const [mealPlanContent, setMealPlanContent] = useState(
    recordToEdit?.type === "meal_plan" && recordToEdit.data.mode === "free_text"
      ? recordToEdit.data.freeTextContent
      : "",
  );
  const [mealPlanPdfFile, setMealPlanPdfFile] = useState<File | null>(null);
  const [activeDayTab, setActiveDayTab] = useState("monday");
  const [weeklyPlan, setWeeklyPlan] = useState<Record<string, DailyMeals>>(
    () => {
      if (
        recordToEdit?.type === "meal_plan" &&
        recordToEdit.data.mode === "weekly"
      )
        return recordToEdit.data.weeklyTemplate;
      return {
        monday: emptyDay(),
        tuesday: emptyDay(),
        wednesday: emptyDay(),
        thursday: emptyDay(),
        friday: emptyDay(),
        saturday: emptyDay(),
        sunday: emptyDay(),
      };
    },
  );

  const [file, setFile] = useState<File | null>(null);
  const [attachmentTitle, setAttachmentTitle] = useState(
    recordToEdit?.type === "attachment" ? recordToEdit.data.title : "",
  );

  const { idToken, user } = useAuth();
  const { activeClinicId } = useClinic();
  const { t } = useI18n();
  const qc = useQueryClient();

  // NUEVO: Traemos las plantillas del backend
  const templatesQuery = useAuthedQuery({
    queryKey: ["measurement-templates", activeClinicId],
    queryFn: (token, clinicId) => apiClient.getTemplates(clinicId, token),
    enabled: open && type === "dynamic_measurement",
  });

  const selectedTemplate = templatesQuery.data?.find(
    (t) => t.id === selectedTemplateId,
  );

  // NUEVO: El cerebro matemático. Calcula fórmulas al vuelo.
  const handleDynamicValueChange = (fieldId: string, value: string) => {
    const newValues = { ...dynamicValues, [fieldId]: value };

    if (selectedTemplate) {
      selectedTemplate.fields
        .filter((f) => f.type === "formula")
        .forEach((f) => {
          if (!f.formula) return;
          let expression = f.formula;
          let canCalculate = true;

          // Buscamos las variables entre llaves {peso}
          const matches = expression.match(/\{([^}]+)\}/g);
          if (matches) {
            matches.forEach((match) => {
              const varName = match.replace(/[{}]/g, "");
              const val = parseFloat(newValues[varName]);
              if (isNaN(val)) canCalculate = false; // Si falta un dato, no calculamos
              expression = expression.replace(match, String(val));
            });
          }

          if (canCalculate) {
            try {
              // Magia de JS: Evalúa el string matemático de forma segura
              const result = new Function("return " + expression)();
              if (isFinite(result)) {
                newValues[f.id] = result.toFixed(f.decimals || 2);
              }
            } catch (e) {
              console.error("Error en la fórmula", e);
            }
          } else {
            newValues[f.id] = "";
          }
        });
    }

    setDynamicValues(newValues);
  };

  const updateMeal = (day: string, meal: keyof DailyMeals, value: string) => {
    setWeeklyPlan((prev) => ({
      ...prev,
      [day]: { ...prev[day], [meal]: value },
    }));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      let dataPayload = {};

      if (type === "note") dataPayload = { content: noteContent };
      if (type === "prescription")
        dataPayload = { content: prescriptionContent };
      if (type === "meal_plan") {
        let pdfData =
          recordToEdit?.type === "meal_plan"
            ? recordToEdit.data.pdf
            : undefined;
        if (mealPlanPdfFile) {
          if (mealPlanPdfFile.type !== "application/pdf") {
            throw new Error(t("records.pdfMustBePdf"));
          }
          const storage = getStorage(getFirebaseApp());
          const uniqueFileName = `${Date.now()}-${Math.random()
            .toString(36)
            .substring(2)}.pdf`;
          const storageRef = ref(
            storage,
            `clinics/${activeClinicId}/patients/${patientId}/meal-plans/${uniqueFileName}`,
          );
          const snapshot = await uploadBytes(storageRef, mealPlanPdfFile, {
            contentType: mealPlanPdfFile.type,
            contentDisposition: `inline; filename="${mealPlanPdfFile.name.replace(/"/g, "")}"`,
          });
          const downloadUrl = await getDownloadURL(snapshot.ref);
          pdfData = {
            fileUrl: downloadUrl,
            fileName: mealPlanPdfFile.name,
            fileType: mealPlanPdfFile.type,
          };
        }

        if (mealPlanMode === "free_text")
          dataPayload = {
            mode: "free_text",
            freeTextContent: mealPlanContent,
            pdf: pdfData,
          };
        else
          dataPayload = {
            mode: "weekly",
            weeklyTemplate: weeklyPlan,
            pdf: pdfData,
          };
      }
      if (type === "measurement") {
        dataPayload = {
          weight: measurements.weight ? Number(measurements.weight) : undefined,
          height: measurements.height ? Number(measurements.height) : undefined,
          bloodPressureSystolic: measurements.bloodPressureSystolic
            ? Number(measurements.bloodPressureSystolic)
            : undefined,
          bloodPressureDiastolic: measurements.bloodPressureDiastolic
            ? Number(measurements.bloodPressureDiastolic)
            : undefined,
          heartRate: measurements.heartRate
            ? Number(measurements.heartRate)
            : undefined,
        };
      }

      // NUEVO: Empaquetamos la plantilla dinámica
      if (type === "dynamic_measurement") {
        if (!selectedTemplate)
          throw new Error(t("records.selectTemplateError"));
        dataPayload = {
          templateId: selectedTemplateId,
          templateName: selectedTemplate.name,
          values: dynamicValues,
          // Guardamos la configuración de los campos para poder dibujarlos en el Muro después
          fieldsConfig: selectedTemplate.fields,
        };
      }

      if (type === "attachment") {
        if (file) {
          const storage = getStorage(getFirebaseApp());
          const fileExtension = file.name.split(".").pop();
          const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
          const storageRef = ref(
            storage,
            `clinics/${activeClinicId}/patients/${patientId}/${uniqueFileName}`,
          );
          const snapshot = await uploadBytes(storageRef, file);
          const downloadUrl = await getDownloadURL(snapshot.ref);

          dataPayload = {
            title: attachmentTitle || file.name,
            fileUrl: downloadUrl,
            fileName: file.name,
            fileType: file.type,
          };
        } else if (isEditing && recordToEdit?.type === "attachment") {
          dataPayload = {
            title: attachmentTitle,
            fileUrl: recordToEdit.data.fileUrl,
            fileName: recordToEdit.data.fileName,
            fileType: recordToEdit.data.fileType,
          };
        } else {
          throw new Error(t("records.fileRequired"));
        }
      }

      if (isEditing) {
        if (rectificationReason.trim().length < 8) {
          throw new Error("Indic? un motivo de rectificaci?n m?s detallado.");
        }
        return apiClient.rectifyClinicalRecord(
          recordToEdit!.id,
          {
            date: new Date(date).toISOString(),
            data: dataPayload,
            reason: rectificationReason.trim(),
            visibleInPatientPortal,
          },
          activeClinicId!,
          idToken ?? undefined,
        );
      } else {
        return apiClient.createClinicalRecord(
          {
            patientId,
            clinicId: activeClinicId!,
            professionalUid: user!.uid,
            type,
            date: new Date(date).toISOString(),
            data: dataPayload,
            visibleInPatientPortal,
          },
          activeClinicId!,
          idToken ?? undefined,
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinical-records", patientId] });
      onOpenChange(false);

      if (!isEditing) {
        setNoteContent("");
        setMeasurements({
          weight: "",
          height: "",
          bloodPressureSystolic: "",
          bloodPressureDiastolic: "",
          heartRate: "",
        });
        setSelectedTemplateId("");
        setDynamicValues({});
        setPrescriptionContent("");
        setMealPlanMode("free_text");
        setMealPlanContent("");
        setMealPlanPdfFile(null);
        setWeeklyPlan({
          monday: emptyDay(),
          tuesday: emptyDay(),
          wednesday: emptyDay(),
          thursday: emptyDay(),
          friday: emptyDay(),
          saturday: emptyDay(),
          sunday: emptyDay(),
        });
        setActiveDayTab("monday");
        setDate(new Date().toISOString().slice(0, 16));
        setVisibleInPatientPortal(false);
        setFile(null);
        setAttachmentTitle("");
      }
    },
    onError: (e) => {
      console.error(e);
      alert(
        isEditing
          ? t("records.rectificationSaveError")
          : t("records.saveError"),
      );
    },
  });

  return (
    <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto bg-white p-6 rounded-xl shadow-2xl border border-slate-200">
      <DialogHeader>
        <DialogTitle>
          {isEditing
            ? t("records.rectify")
            : t("records.addToHistory")}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("records.type")}</Label>
            <Select
              value={type}
              onChange={(e) => setType(e.target.value as RecordType)}
              disabled={isEditing}
            >
              <option value="note">{t("records.note")}</option>
              <option value="dynamic_measurement">
                {t("records.customTemplate")}
              </option>
              <option value="prescription">{t("records.prescription")}</option>
              <option value="meal_plan">{t("records.mealPlan")}</option>
              <option value="attachment">{t("records.attachment")}</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("records.dateTime")}</Label>
            <Input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <hr className="my-2" />

        {isEditing ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {t("records.immutableWarning")}
          </div>
        ) : null}

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={visibleInPatientPortal}
            onChange={(e) => setVisibleInPatientPortal(e.target.checked)}
          />
          <span>
            <span className="block font-medium text-slate-800">
              {t("records.visibleInPortal")}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("records.visibleInPortalHelp")}
            </span>
          </span>
        </label>

        {type === "note" && (
          <div className="space-y-2">
            <Label>{t("records.noteLabel")}</Label>
            <Textarea
              placeholder={t("records.notePlaceholder")}
              className="min-h-[150px]"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
            />
          </div>
        )}

        {/* NUEVO: Contenedor Dinámico */}
        {type === "dynamic_measurement" && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>{t("records.selectTemplate")}</Label>
              <Select
                value={selectedTemplateId}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value);
                  setDynamicValues({}); // Reseteamos valores al cambiar de plantilla
                }}
                disabled={isEditing}
              >
                <option value="">{t("records.chooseTemplate")}</option>
                {templatesQuery.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>

            {selectedTemplate && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border border-slate-200 p-5 rounded-xl bg-slate-50/50">
                {selectedTemplate.fields.map((field) => (
                  <div
                    key={field.id}
                    className={`space-y-2 ${field.type === "formula" ? "col-span-full" : ""}`}
                  >
                    <Label
                      className={
                        field.type === "formula"
                          ? "text-purple-700 font-semibold"
                          : ""
                      }
                    >
                      {field.label} {field.unit ? `(${field.unit})` : ""}
                      {field.type === "formula" && ` (${t("records.autocalculated")})`}
                    </Label>

                    {field.type === "text" ? (
                      <Input
                        type="text"
                        value={dynamicValues[field.id] || ""}
                        onChange={(e) =>
                          handleDynamicValueChange(field.id, e.target.value)
                        }
                        placeholder={t("records.enterFieldValue", {
                          field: field.label.toLowerCase(),
                        })}
                      />
                    ) : field.type === "number" ? (
                      <Input
                        type="number"
                        step="any"
                        value={dynamicValues[field.id] || ""}
                        onChange={(e) =>
                          handleDynamicValueChange(field.id, e.target.value)
                        }
                        placeholder="0.00"
                      />
                    ) : field.type === "formula" ? (
                      <div className="relative">
                        <Calculator className="absolute left-3 top-2.5 h-4 w-4 text-purple-400" />
                        <Input
                          type="text"
                          readOnly
                          className="pl-9 bg-purple-50 font-bold text-purple-900 border-purple-200 focus-visible:ring-0 shadow-inner"
                          value={dynamicValues[field.id] || ""}
                          placeholder={t("records.waitingData")}
                          tabIndex={-1}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {type === "prescription" && (
          <div className="space-y-2">
            <Label>{t("records.prescription")}</Label>
            <Textarea
              className="min-h-[150px]"
              value={prescriptionContent}
              onChange={(e) => setPrescriptionContent(e.target.value)}
            />
          </div>
        )}

        {type === "meal_plan" && (
          <div className="space-y-4">
            <Tabs
              value={mealPlanMode}
              onValueChange={(v) =>
                setMealPlanMode(v as "free_text" | "weekly")
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="free_text">{t("records.freeText")}</TabsTrigger>
                <TabsTrigger value="weekly">{t("records.weeklyGrid")}</TabsTrigger>
              </TabsList>
              <TabsContent value="free_text" className="mt-4">
                <Textarea
                  className="min-h-[200px]"
                  value={mealPlanContent}
                  onChange={(e) => setMealPlanContent(e.target.value)}
                />
              </TabsContent>
              <TabsContent
                value="weekly"
                className="mt-4 border rounded-lg p-4 bg-slate-50/50"
              >
                <Tabs value={activeDayTab} onValueChange={setActiveDayTab}>
                  <TabsList className="flex w-full justify-between mb-4 bg-transparent p-0 h-auto gap-1">
                    {DAYS_OF_WEEK.map((day) => (
                      <TabsTrigger
                        key={day.key}
                        value={day.key}
                        className="flex-1 data-[state=active]:bg-primary border"
                      >
                        {day.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {DAYS_OF_WEEK.map((day) => (
                    <TabsContent
                      key={day.key}
                      value={day.key}
                      className="space-y-3 mt-0"
                    >
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("records.breakfast")}</Label>
                          <Textarea
                            rows={2}
                            value={weeklyPlan[day.key].breakfast}
                            onChange={(e) =>
                              updateMeal(day.key, "breakfast", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("records.lunch")}</Label>
                          <Textarea
                            rows={2}
                            value={weeklyPlan[day.key].lunch}
                            onChange={(e) =>
                              updateMeal(day.key, "lunch", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("records.snack")}</Label>
                          <Textarea
                            rows={2}
                            value={weeklyPlan[day.key].snack}
                            onChange={(e) =>
                              updateMeal(day.key, "snack", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("records.dinner")}</Label>
                          <Textarea
                            rows={2}
                            value={weeklyPlan[day.key].dinner}
                            onChange={(e) =>
                              updateMeal(day.key, "dinner", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </TabsContent>
            </Tabs>
            <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <Label>{t("records.mealPlanPdf")}</Label>
              {isEditing &&
              recordToEdit?.type === "meal_plan" &&
              recordToEdit.data.pdf?.fileUrl &&
              !mealPlanPdfFile ? (
                <p className="text-xs text-muted-foreground">
                  {t("records.pdfReplaceHelp")}
                </p>
              ) : null}
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) =>
                  setMealPlanPdfFile(e.target.files?.[0] || null)
                }
              />
              {mealPlanPdfFile ? (
                <p className="text-sm font-medium text-emerald-700">
                  {t("records.readyToUpload", { name: mealPlanPdfFile.name })}
                </p>
              ) : null}
            </div>
          </div>
        )}

        {type === "attachment" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("records.attachmentTitle")}</Label>
              <Input
                placeholder={t("records.attachmentTitlePlaceholder")}
                value={attachmentTitle}
                onChange={(e) => setAttachmentTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("records.selectAttachment")}</Label>
              {isEditing && !file && (
                <p className="text-xs text-muted-foreground mb-2">
                  {t("records.attachmentReplaceHelp")}
                </p>
              )}
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors">
                <Paperclip className="h-8 w-8 text-slate-400 mb-2" />
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  className="cursor-pointer max-w-sm"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file && (
                  <p className="mt-2 text-sm text-emerald-600 font-medium">
                    {t("records.readyToUpload", {
                      name: `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {isEditing ? (
          <div className="space-y-2">
            <Label>{t("records.rectificationReason")}</Label>
            <Textarea
              className="min-h-[90px]"
              value={rectificationReason}
              onChange={(e) => setRectificationReason(e.target.value)}
              placeholder={t("records.rectificationReasonPlaceholder")}
            />
          </div>
        ) : null}
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("action.cancel")}
        </Button>
        <Button
          onClick={() => mutation.mutate()}
          disabled={
            mutation.isPending || (type === "attachment" && !file && !isEditing)
          }
        >
          {mutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {mutation.isPending
            ? t("records.uploadingSaving")
            : isEditing
              ? t("records.saveRectification")
              : t("records.saveToHistory")}
        </Button>
      </div>
    </DialogContent>
  );
}

export function NewRecordDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t("records.new")}
        </Button>
      </DialogTrigger>
      {open && (
        <RecordForm patientId={patientId} open={open} onOpenChange={setOpen} />
      )}
    </Dialog>
  );
}

export function EditRecordDialog({
  record,
  open,
  onOpenChange,
}: {
  record: ClinicalRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <RecordForm
          patientId={record.patientId}
          recordToEdit={record}
          open={open}
          onOpenChange={onOpenChange}
        />
      )}
    </Dialog>
  );
}
