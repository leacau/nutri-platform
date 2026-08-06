"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../../components/ui/card";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../../../components/ui/dialog";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Badge } from "../../../../../components/ui/badge";
import { Button } from "../../../../../components/ui/button";
import { Label } from "../../../../../components/ui/label";
import { NewRecordDialog } from "./components/new-record-dialog";
import { RecordTimeline } from "./components/record-timeline";
import { Textarea } from "../../../../../components/ui/textarea";
import { UserAccount } from "../../../../../lib/types";
import { apiClient } from "../../../../../lib/api-client";
import { formatDate } from "../../../../../lib/utils";
import { useAuth } from "../../../../../providers/auth-provider";
import { useAuthedQuery } from "../../../../../hooks/use-authed-query";
import { useClinic } from "../../../../../providers/clinic-provider";
import { useI18n } from "../../../../../providers/i18n-provider";
import { usePermissions } from "../../../../../hooks/use-permissions";
import { useParams } from "next/navigation";

// Función escudo para fechas (igual a la que usamos en el Dashboard)
const parseSafeDate = (dateVal: any): Date | null => {
  if (!dateVal) return null;
  if (dateVal instanceof Date) return dateVal;
  if (typeof dateVal.toDate === "function") return dateVal.toDate();
  if (typeof dateVal === "object" && "_seconds" in dateVal)
    return new Date(dateVal._seconds * 1000);
  if (typeof dateVal === "object" && "seconds" in dateVal)
    return new Date(dateVal.seconds * 1000);
  const parsed = new Date(dateVal);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const isSameDay = (apptDateVal: any, todayStr: string) => {
  const d = parseSafeDate(apptDateVal);
  if (!d) return false;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` === todayStr;
};

const accountUid = (account: UserAccount) => account.uid || account.id;

function ProfessionalPrivateNoteDialog({
  patientId,
  initialContent,
}: {
  patientId: string;
  initialContent: string;
}) {
  const { idToken } = useAuth();
  const { activeClinicId } = useClinic();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const hasNote = initialContent.trim().length > 0;
  const mutation = useMutation({
    mutationFn: () =>
      apiClient.updatePatientProfessionalNote(
        patientId,
        activeClinicId || "",
        content,
        idToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient", patientId] });
      setOpen(false);
    },
    onError: () => {
      alert(t("patients.privateNoteSaveError"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={
            hasNote
              ? "text-amber-500 hover:bg-amber-50 hover:text-amber-600"
              : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          }
          title={t("patients.privateNoteButtonTitle")}
        >
          <AlertTriangle className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-white p-6 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t("patients.privateNoteTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label>{t("patients.privateNoteLabel")}</Label>
          <Textarea
            className="min-h-[180px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("patients.privateNotePlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("patients.privateNoteHelp")}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("action.cancel")}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t("common.processing") : t("patients.privateNoteSave")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const { idToken, user } = useAuth();
  const { activeClinicId, activeMembership } = useClinic();
  const { t } = useI18n();
  const perms = usePermissions();
  const qc = useQueryClient();

  // Estado para la fecha de hoy (evita error de hidratación)
  const [isMounted, setIsMounted] = useState(false);
  const [todayDateString, setTodayDateString] = useState("");

  useEffect(() => {
    setIsMounted(true);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    setTodayDateString(`${year}-${month}-${day}`);
  }, []);

  // 1. Traemos los datos del paciente
  const patientQuery = useAuthedQuery({
    queryKey: ["patient", params.id],
    queryFn: (token, clinicId) => apiClient.patient(params.id, clinicId, token),
  });

  // 2. Traemos los turnos
  const appointmentsQuery = useAuthedQuery({
    queryKey: ["patient-appointments", params.id],
    queryFn: (token, clinicId) => apiClient.appointments(clinicId, token),
  });

  // 3. Traemos el historial clínico (El Muro)
  const recordsQuery = useAuthedQuery({
    queryKey: ["clinical-records", params.id],
    queryFn: (token, clinicId) =>
      apiClient.getClinicalRecords(params.id, clinicId, token),
    enabled: perms.canViewMedicalRecords,
  });
  const professionalsQuery = useAuthedQuery({
    queryKey: ["professionals", activeClinicId],
    queryFn: (token, clinicId) => apiClient.professionals(clinicId, token),
  });

  // Mutación para completar el turno directamente desde la ficha
  const completeMutation = useMutation({
    mutationFn: async (apptId: string) =>
      apiClient.completeAppointment(
        apptId,
        activeClinicId || "",
        idToken || undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patient-appointments", params.id] });
      // También invalidamos los turnos globales para que el Dashboard se entere
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  const patient = patientQuery.data;

  // Todos los turnos de este paciente
  const appointments = (appointmentsQuery.data || []).filter(
    (appt) => appt.patientId === params.id,
  );

  // Buscamos si el paciente tiene un turno ACTIVO para EL DÍA DE HOY (programado o en sala de espera)
  const activeAppointmentToday = isMounted
    ? appointments.find(
        (appt) =>
          (appt.status === "scheduled" || appt.status === "arrived") &&
          isSameDay(appt.scheduledFor, todayDateString),
      )
    : null;

  const records = perms.canViewMedicalRecords ? recordsQuery.data || [] : [];
  const professionalNameByUid = (uid?: string | null) => {
    if (!uid) return t("common.noProfessional");
    return (
      professionalsQuery.data?.find(
        (professional: UserAccount) => accountUid(professional) === uid,
      )?.name ?? t("common.workspaceProfessionalUnavailable")
    );
  };
  const assignedProfessionalNames = (patient?.assignedProfessionalUids ?? [])
    .map(professionalNameByUid)
    .join(", ");

  if (patientQuery.isLoading || !isMounted) {
    return <p className="text-sm text-muted-foreground">{t("patients.loadingRecord")}</p>;
  }

  if (!patient) {
    return (
      <p className="text-sm text-destructive">
        {t("patients.notFoundActiveWorkspace")}
      </p>
    );
  }

  const formatSex = (sexo?: string | null) => {
    if (sexo === "female") return t("sex.female");
    if (sexo === "male") return t("sex.male");
    if (sexo === "other") return t("sex.other");
    return "—";
  };

  return (
    <div className="space-y-6">
      {/* Cabecera del Paciente */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-6 rounded-xl border shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
              {patient.name}
            </h1>
            {activeMembership?.role === "professional" ? (
              <ProfessionalPrivateNoteDialog
                patientId={patient.id}
                initialContent={patient.privateProfessionalNote || ""}
              />
            ) : null}
            {/* BOTÓN INTELIGENTE: Solo aparece si hay turno hoy */}
            {activeAppointmentToday && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm ml-2"
                onClick={() =>
                  completeMutation.mutate(activeAppointmentToday.id)
                }
                disabled={completeMutation.isPending}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {completeMutation.isPending
                  ? t("patients.finishingAppointment")
                  : t("patients.finishCurrentAppointment")}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-sm text-slate-500 font-medium">
              {patient.email || t("patients.noEmailRegistered")}
            </p>
            <span className="text-slate-300">•</span>
            <Badge
              variant="secondary"
              className="text-xs font-normal bg-slate-100 text-slate-600"
            >
              {t("patients.assigned")}:{" "}
              {assignedProfessionalNames || t("patients.generalClinic")}
            </Badge>
          </div>
        </div>
      </div>

      {/* Contenedor Principal: 2 Columnas */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[350px_1fr]">
        {/* COLUMNA IZQUIERDA: Datos Estáticos del Paciente */}
        <div className="space-y-6">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg">{t("patients.personalData")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  DNI
                </p>
                <p className="font-medium text-slate-900">
                  {(patient as any).dni || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  {t("common.phone")}
                </p>
                <p className="font-medium text-slate-900">
                  {patient.phone || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  {t("patients.sex")}
                </p>
                <p className="font-medium capitalize text-slate-900">
                  {formatSex(patient.sexo)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  {t("patients.birthDate")}
                </p>
                <p className="font-medium text-slate-900">
                  {patient.birthDate ? formatDate(patient.birthDate) : "—"}
                </p>
              </div>
              {patient.notes && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    {t("patients.admissionNotes")}
                  </p>
                  <p className="text-sm mt-1 whitespace-pre-line text-slate-700 bg-amber-50 p-3 rounded-lg border border-amber-100">
                    {patient.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tarjeta de Turnos Históricos */}
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
              <CardTitle className="text-lg">{t("patients.appointmentHistory")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-4 max-h-[300px] overflow-y-auto pr-2">
              {appointments.map((appt) => {
                const safeDate = parseSafeDate(appt.scheduledFor);
                return (
                  <div
                    key={appt.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-3 hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <Badge
                        variant={
                          appt.status === "completed"
                            ? "default"
                            : appt.status === "cancelled"
                              ? "outline"
                              : "secondary"
                        }
                        className="mb-1"
                      >
                        {t(`status.${appt.status}`)}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {t("professionals.title")}: {professionalNameByUid(appt.professionalUid)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-700">
                        {safeDate ? formatDate(safeDate.toISOString()) : "—"}
                      </p>
                    </div>
                  </div>
                );
              })}
              {!appointments.length ? (
                <p className="text-sm text-center text-muted-foreground py-4">
                  {t("patients.noAppointments")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* COLUMNA DERECHA: El Muro de Historia Clínica */}
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border shadow-sm border-slate-200">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                {t("patients.clinicalEvolution")}
              </h2>
              <p className="text-sm text-slate-500">
                {t("patients.totalRecords", { count: records.length })}
              </p>
            </div>

            {/* Llamamos al Modal que creamos arriba */}
            {perms.canEditMedicalRecords ? (
              <NewRecordDialog patientId={patient.id} />
            ) : null}
          </div>

          {/* Contenedor del Timeline */}
          {recordsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-4">
              {t("patients.loadingHistory")}
            </p>
          ) : records.length === 0 ? (
            <Card className="border-dashed border-2 bg-slate-50/50 shadow-none border-slate-200">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="bg-white p-4 rounded-full shadow-sm mb-4 border border-slate-100">
                  <FileText className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-lg font-medium text-slate-700">
                  {t("patients.noClinicalRecords")}
                </p>
                <p className="text-sm text-slate-500 max-w-[400px] mt-2">
                  {t("patients.noClinicalRecordsDetail")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <RecordTimeline
              records={records}
              patient={patient}
              professionalNameByUid={professionalNameByUid}
            />
          )}
        </div>
      </div>
    </div>
  );
}
