"use client";

import {
  Activity,
  Apple,
  Calculator,
  Eye,
  EyeOff,
  FileText,
  MoreVertical,
  Paperclip,
  Pencil,
  Pill,
  Printer,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../../../../components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../../../components/ui/card";
import { ClinicalRecord, apiClient } from "../../../../../../lib/api-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../../../components/ui/dropdown-menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "../../../../../../components/ui/button";
import { EditRecordDialog } from "./new-record-dialog";
import { evaluateMeasurement } from "../../../../../../lib/clinical-evaluator";
import { formatDate } from "../../../../../../lib/utils";
import { useAuth } from "../../../../../../providers/auth-provider";
import { useClinic } from "../../../../../../providers/clinic-provider";
import { useReactToPrint } from "react-to-print";

// Calculador rápido de edad
const getAge = (birthDateString?: string) => {
  if (!birthDateString) return 30; // Fallback por defecto
  const today = new Date();
  const birthDate = new Date(birthDateString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Mapeo de sexo al formato del evaluator ('M' o 'F')
const getGenderCode = (sexo?: string) => {
  if (!sexo) return "M";
  const s = sexo.toLowerCase();
  if (s.startsWith("f")) return "F";
  return "M";
};

// NUEVO: Agregamos "patient" a las props
export function RecordTimeline({
  records,
  patient,
  readOnly = false,
}: {
  records: ClinicalRecord[];
  patient: any;
  readOnly?: boolean;
}) {
  if (!records || records.length === 0) return null;

  return (
    <div className="space-y-4">
      {records.map((record) => (
        <RecordCard
          key={record.id}
          record={record}
          patient={patient}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

function RecordCard({
  record,
  patient,
  readOnly,
}: {
  record: ClinicalRecord;
  patient: any;
  readOnly: boolean;
}) {
  const { id, patientId, type, date, data, professionalUid } = record;
  const contentRef = useRef<HTMLDivElement>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { idToken } = useAuth();
  const { activeClinicId } = useClinic();
  const qc = useQueryClient();

  // Extraemos edad y sexo del paciente para el Cerebro Clínico
  const patientAge = getAge(patient?.birthDate);
  const patientGender = getGenderCode(patient?.sexo);

  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle: `Registro_${type}_${formatDate(date)}`,
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiClient.deleteClinicalRecord(id, activeClinicId!, idToken ?? undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinical-records", patientId] });
      setIsDeleteDialogOpen(false);
    },
    onError: () => {
      alert(
        "No se pudo eliminar el registro. Revisá que tengas los permisos necesarios.",
      );
      setIsDeleteDialogOpen(false);
    },
  });

  const portalVisibilityMutation = useMutation({
    mutationFn: (visibleInPatientPortal: boolean) =>
      apiClient.updateClinicalRecord(
        id,
        { visibleInPatientPortal },
        activeClinicId!,
        idToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clinical-records", patientId] });
      qc.invalidateQueries({
        queryKey: ["portal-clinical-records", patientId],
      });
    },
    onError: () => {
      alert("No pudimos actualizar la visibilidad del registro.");
    },
  });

  const config = {
    note: {
      icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      title: "Evolución Clínica",
    },
    measurement: {
      icon: Activity,
      color: "text-slate-600",
      bg: "bg-slate-50",
      border: "border-slate-200",
      title: "Mediciones (Legado)",
    },
    dynamic_measurement: {
      icon: Activity,
      color: "text-purple-600",
      bg: "bg-purple-50",
      border: "border-purple-200",
      title: data?.templateName || "Plantilla de Medición",
    },
    prescription: {
      icon: Pill,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "border-red-100",
      title: "Receta / Indicaciones",
    },
    meal_plan: {
      icon: Apple,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      title: "Plan de Alimentación",
    },
    attachment: {
      icon: Paperclip,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-100",
      title: "Estudio / Archivo Adjunto",
    },
  }[type] || {
    icon: FileText,
    color: "text-gray-600",
    bg: "bg-gray-50",
    border: "border-gray-100",
    title: "Registro Clínico",
  };

  const Icon = config.icon;

  return (
    <>
      <Card
        ref={contentRef}
        className="overflow-hidden shadow-sm print:shadow-none print:border-none print:m-4 relative group"
      >
        <CardHeader
          className={`flex flex-row items-center justify-between py-3 border-b ${config.bg} ${config.border}`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full bg-white shadow-sm ${config.color} print:border print:border-slate-200`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-medium text-slate-800">
                {config.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDate(date)} · Firmado por UID: {professionalUid}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 print:hidden">
            {!readOnly ? (
              <Button
                variant={
                  record.visibleInPatientPortal ? "secondary" : "outline"
                }
                size="sm"
                className="bg-white hover:bg-slate-50"
                onClick={() =>
                  portalVisibilityMutation.mutate(
                    !record.visibleInPatientPortal,
                  )
                }
                disabled={portalVisibilityMutation.isPending}
              >
                {record.visibleInPatientPortal ? (
                  <Eye className="mr-2 h-4 w-4" />
                ) : (
                  <EyeOff className="mr-2 h-4 w-4" />
                )}
                {record.visibleInPatientPortal
                  ? "Visible en portal"
                  : "Oculto al paciente"}
              </Button>
            ) : null}

            {(type === "prescription" ||
              type === "meal_plan" ||
              type === "dynamic_measurement") && (
              <Button
                variant="outline"
                size="sm"
                className="bg-white hover:bg-slate-50"
                onClick={() => handlePrint()}
              >
                <Printer className="mr-2 h-4 w-4" /> Imprimir
              </Button>
            )}

            {!readOnly ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-500 hover:text-slate-900"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => setIsEditDialogOpen(true)}
                    className="cursor-pointer"
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Editar registro
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    className="text-red-600 cursor-pointer"
                    onClick={() => setIsDeleteDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar registro
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="p-5 text-sm text-slate-700">
          {type === "note" && (
            <p className="whitespace-pre-line leading-relaxed">
              {data?.content || "Sin contenido"}
            </p>
          )}
          {type === "prescription" && (
            <p className="whitespace-pre-line leading-relaxed text-lg font-medium">
              {data?.content || "Sin contenido"}
            </p>
          )}

          {type === "meal_plan" && (
            <div>
              {data?.mode === "free_text" && (
                <p className="whitespace-pre-line leading-relaxed">
                  {data?.freeTextContent || "Sin contenido"}
                </p>
              )}
              {data?.mode === "weekly" && data?.weeklyTemplate && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[600px] print:text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] tracking-wider print:bg-slate-100">
                        <th className="p-3 border-b border-slate-200 font-semibold w-24">
                          Comida
                        </th>
                        <th className="p-3 border-b border-slate-200 font-semibold">
                          Lunes
                        </th>
                        <th className="p-3 border-b border-slate-200 font-semibold">
                          Martes
                        </th>
                        <th className="p-3 border-b border-slate-200 font-semibold">
                          Miércoles
                        </th>
                        <th className="p-3 border-b border-slate-200 font-semibold">
                          Jueves
                        </th>
                        <th className="p-3 border-b border-slate-200 font-semibold">
                          Viernes
                        </th>
                        <th className="p-3 border-b border-slate-200 font-semibold bg-emerald-50/50 print:bg-emerald-50">
                          Sábado
                        </th>
                        <th className="p-3 border-b border-slate-200 font-semibold bg-emerald-50/50 print:bg-emerald-50">
                          Domingo
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-xs print:text-xs">
                      {/* (Código de la grilla de dieta que ya tenías, resumido para no estirar el archivo innecesariamente) */}
                      <tr className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                          Desayuno
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.monday?.breakfast || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.tuesday?.breakfast || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.wednesday?.breakfast || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.thursday?.breakfast || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.friday?.breakfast || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap bg-emerald-50/30">
                          {data.weeklyTemplate.saturday?.breakfast || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap bg-emerald-50/30">
                          {data.weeklyTemplate.sunday?.breakfast || "-"}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                          Almuerzo
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.monday?.lunch || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.tuesday?.lunch || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.wednesday?.lunch || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.thursday?.lunch || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.friday?.lunch || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap bg-emerald-50/30">
                          {data.weeklyTemplate.saturday?.lunch || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap bg-emerald-50/30">
                          {data.weeklyTemplate.sunday?.lunch || "-"}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                          Merienda
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.monday?.snack || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.tuesday?.snack || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.wednesday?.snack || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.thursday?.snack || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.friday?.snack || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap bg-emerald-50/30">
                          {data.weeklyTemplate.saturday?.snack || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap bg-emerald-50/30">
                          {data.weeklyTemplate.sunday?.snack || "-"}
                        </td>
                      </tr>
                      <tr className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900 bg-slate-50/50">
                          Cena
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.monday?.dinner || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.tuesday?.dinner || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.wednesday?.dinner || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.thursday?.dinner || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap">
                          {data.weeklyTemplate.friday?.dinner || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap bg-emerald-50/30">
                          {data.weeklyTemplate.saturday?.dinner || "-"}
                        </td>
                        <td className="p-3 border-l border-slate-100 whitespace-pre-wrap bg-emerald-50/30">
                          {data.weeklyTemplate.sunday?.dinner || "-"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {data?.pdf?.fileUrl ? (
                <PdfPreview
                  title={data.pdf.fileName || "Plan de alimentación"}
                  url={data.pdf.fileUrl}
                />
              ) : null}
            </div>
          )}

          {type === "measurement" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 opacity-75 grayscale-[50%]">
              {data?.weight && (
                <Metric label="Peso" value={`${data.weight} kg`} />
              )}
              {data?.height && (
                <Metric label="Altura" value={`${data.height} cm`} />
              )}
              {(data?.bloodPressureSystolic ||
                data?.bloodPressureDiastolic) && (
                <Metric
                  label="Presión Arterial"
                  value={`${data.bloodPressureSystolic || "--"}/${data.bloodPressureDiastolic || "--"}`}
                />
              )}
              {data?.heartRate && (
                <Metric
                  label="Frec. Cardíaca"
                  value={`${data.heartRate} ppm`}
                />
              )}
            </div>
          )}

          {/* ACÁ ACTÚA EL CEREBRO CLÍNICO */}
          {type === "dynamic_measurement" && data?.fieldsConfig && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {data.fieldsConfig.map((field: any) => {
                const valStr = data.values?.[field.id];
                if (!valStr && valStr !== 0 && field.type !== "formula")
                  return null; // Ocultamos los vacíos

                const valNum = parseFloat(valStr);
                let evalResult = null;

                // Si es un número o fórmula válida, se la pasamos al evaluador
                if (
                  !isNaN(valNum) &&
                  (field.type === "number" || field.type === "formula")
                ) {
                  evalResult = evaluateMeasurement(
                    field.standardMapping || field.label,
                    valNum,
                    patientAge,
                    patientGender,
                  );
                }

                // Pintamos la tarjeta de acuerdo a la respuesta de la OMS (rojo, verde, amarillo)
                const bgClass =
                  evalResult && evalResult.status !== "unknown"
                    ? evalResult.bgClass
                    : field.type === "formula"
                      ? "bg-purple-50"
                      : "bg-slate-50";
                const borderClass =
                  evalResult && evalResult.status !== "unknown"
                    ? evalResult.borderClass
                    : field.type === "formula"
                      ? "border-purple-100"
                      : "border-slate-100";
                const textColorClass =
                  evalResult && evalResult.status !== "unknown"
                    ? evalResult.colorClass
                    : field.type === "formula"
                      ? "text-purple-600"
                      : "text-muted-foreground";
                const valColorClass =
                  evalResult && evalResult.status !== "unknown"
                    ? evalResult.colorClass
                    : field.type === "formula"
                      ? "text-purple-900 font-bold"
                      : "text-slate-900";

                return (
                  <div
                    key={field.id}
                    className={`p-3 rounded-lg border ${bgClass} ${borderClass}`}
                  >
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-wider mb-1 flex items-center justify-between gap-1 ${textColorClass}`}
                    >
                      <span className="flex items-center gap-1">
                        {field.type === "formula" && (
                          <Calculator className="h-3 w-3" />
                        )}
                        {field.label}
                      </span>
                    </p>
                    <div className="flex flex-col">
                      <p className={`font-medium text-lg ${valColorClass}`}>
                        {valStr || "--"}{" "}
                        <span className="text-sm font-normal opacity-70 ml-0.5">
                          {field.unit}
                        </span>
                      </p>

                      {/* Si la OMS detectó un estado (ej: "Obesidad (++)"), lo mostramos chiquito abajo */}
                      {evalResult && evalResult.status !== "unknown" && (
                        <span
                          className={`text-[10px] font-bold mt-1 uppercase ${textColorClass}`}
                        >
                          {evalResult.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {type === "attachment" && data?.fileUrl && (
            <div className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-lg border border-slate-200 mt-2">
              <div className="p-3 bg-white rounded-full border border-slate-200 shadow-sm">
                <Paperclip className="h-5 w-5 text-slate-400" />
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-semibold text-slate-700 truncate">
                  {data.title || data.fileName}
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                  {(data.fileType || "Archivo").split("/")[1] || data.fileType}
                </p>
              </div>
              <Button asChild variant="default" size="sm" className="shadow-sm">
                <a
                  href={data.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver Documento
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="bg-white p-6 rounded-xl shadow-2xl border border-slate-200">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente
              este registro clínico de la base de datos de la clínica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteMutation.mutate();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Sí, eliminar registro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <EditRecordDialog
        record={record}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />
    </>
  );
}

function PdfPreview({ title, url }: { title: string; url: string }) {
  const viewerUrl = `${url}${url.includes("?") ? "&" : "?"}response-content-disposition=inline`;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-2">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-700">{title}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="bg-white">
          <a href={url} target="_blank" rel="noopener noreferrer">
            Abrir
          </a>
        </Button>
      </div>
      <object
        data={viewerUrl}
        type="application/pdf"
        className="h-[520px] w-full bg-white"
      >
        <iframe
          src={viewerUrl}
          title={title}
          className="h-[520px] w-full bg-white"
        />
        <div className="p-4 text-sm text-muted-foreground">
          No pudimos mostrar el PDF embebido en este navegador.
        </div>
      </object>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}
