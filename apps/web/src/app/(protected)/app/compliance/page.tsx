"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck,
  DatabaseBackup,
  FileWarning,
  Lock,
  Save,
  ShieldCheck,
} from "lucide-react";

import { RoleGuard } from "../../../../components/guards";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Select } from "../../../../components/ui/select";
import { Textarea } from "../../../../components/ui/textarea";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import type {
  BackupEvent,
  CompliancePolicy,
  DataSubjectRequest,
  DataSubjectRequestType,
} from "../../../../lib/types";
import { formatDate } from "../../../../lib/utils";
import { useAuth } from "../../../../providers/auth-provider";
import { useClinic } from "../../../../providers/clinic-provider";
import { useI18n } from "../../../../providers/i18n-provider";

type PolicyForm = Pick<
  CompliancePolicy,
  | "mfaRequiredForAdmins"
  | "mfaRequiredForProfessionals"
  | "sessionTimeoutMinutes"
  | "clinicalRecordRetentionYears"
  | "backupFrequency"
  | "backupRetentionDays"
  | "internationalTransferProvider"
  | "internationalTransferSafeguards"
  | "digitalSignatureMode"
  | "incidentResponseContact"
  | "dataProtectionContact"
>;

const requestTypeLabels: Record<DataSubjectRequestType, string> = {
  access: "Acceso",
  rectification: "Rectificación",
  update: "Actualización",
  confidentiality: "Confidencialidad",
  deletion: "Supresión/Bloqueo",
  export: "Exportación",
};

function statusVariant(status: string) {
  if (status === "configured" || status === "fulfilled" || status === "success") return "secondary";
  if (status === "external_required" || status === "in_review" || status === "verified") return "outline";
  return "destructive";
}

export default function CompliancePage() {
  const { activeClinicId, activeClinic, platformRole } = useClinic();
  const { idToken } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const digitalSignatureEnabled =
    platformRole === "platform_admin" ||
    activeClinic?.billing?.enabledModules?.digitalSignature === true;
  const requestLabel = (type: DataSubjectRequestType) => t(`compliance.request.${type}`);

  const checklistQuery = useAuthedQuery({
    queryKey: ["compliance-checklist"],
    queryFn: (token, clinicId) => apiClient.complianceChecklist(clinicId, token),
  });
  const requestsQuery = useAuthedQuery({
    queryKey: ["data-subject-requests"],
    queryFn: (token, clinicId) => apiClient.dataSubjectRequests(clinicId, token),
  });
  const backupQuery = useAuthedQuery({
    queryKey: ["backup-events"],
    queryFn: (token, clinicId) => apiClient.backupEvents(clinicId, token),
  });

  const [policy, setPolicy] = useState<PolicyForm>({
    mfaRequiredForAdmins: true,
    mfaRequiredForProfessionals: true,
    sessionTimeoutMinutes: 15,
    clinicalRecordRetentionYears: 10,
    backupFrequency: "daily",
    backupRetentionDays: 35,
    internationalTransferProvider: "Google Cloud / Firebase",
    internationalTransferSafeguards:
      "Clausulas contractuales, controles de acceso, cifrado en transito y reposo.",
    digitalSignatureMode: "pending_provider",
    incidentResponseContact: "",
    dataProtectionContact: "",
  });
  const [backupForm, setBackupForm] = useState({
    provider: "Google Cloud",
    location: "southamerica-east1",
    status: "verified" as BackupEvent["status"],
    detail: "",
  });
  const [requestForm, setRequestForm] = useState({
    type: "access" as DataSubjectRequestType,
    patientId: "",
    subjectEmail: "",
    description: "",
  });

  useEffect(() => {
    const incoming = checklistQuery.data?.policy;
    if (!incoming) return;
    setPolicy({
      mfaRequiredForAdmins: incoming.mfaRequiredForAdmins,
      mfaRequiredForProfessionals: incoming.mfaRequiredForProfessionals,
      sessionTimeoutMinutes: incoming.sessionTimeoutMinutes,
      clinicalRecordRetentionYears: incoming.clinicalRecordRetentionYears,
      backupFrequency: incoming.backupFrequency,
      backupRetentionDays: incoming.backupRetentionDays,
      internationalTransferProvider: incoming.internationalTransferProvider,
      internationalTransferSafeguards: incoming.internationalTransferSafeguards,
      digitalSignatureMode: incoming.digitalSignatureMode,
      incidentResponseContact: incoming.incidentResponseContact,
      dataProtectionContact: incoming.dataProtectionContact,
    });
  }, [checklistQuery.data?.policy]);

  const invalidateCompliance = () => {
    qc.invalidateQueries({ queryKey: ["compliance-checklist"] });
    qc.invalidateQueries({ queryKey: ["data-subject-requests"] });
    qc.invalidateQueries({ queryKey: ["backup-events"] });
  };

  const policyMutation = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error("Sin espacio activo");
      return apiClient.saveCompliancePolicy(activeClinicId, policy, idToken ?? undefined);
    },
    onSuccess: invalidateCompliance,
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error("Sin espacio activo");
      return apiClient.createBackupEvent(
        activeClinicId,
        {
          provider: backupForm.provider,
          location: backupForm.location || undefined,
          status: backupForm.status,
          detail: backupForm.detail,
        },
        idToken ?? undefined,
      );
    },
    onSuccess: () => {
      setBackupForm((prev) => ({ ...prev, detail: "" }));
      invalidateCompliance();
    },
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error("Sin espacio activo");
      return apiClient.createDataSubjectRequest(
        activeClinicId,
        {
          type: requestForm.type,
          patientId: requestForm.patientId || undefined,
          subjectEmail: requestForm.subjectEmail || undefined,
          description: requestForm.description,
        },
        idToken ?? undefined,
      );
    },
    onSuccess: () => {
      setRequestForm((prev) => ({ ...prev, patientId: "", subjectEmail: "", description: "" }));
      invalidateCompliance();
    },
  });

  const resolveRequestMutation = useMutation({
    mutationFn: async (request: DataSubjectRequest) => {
      if (!activeClinicId) throw new Error("Sin espacio activo");
      return apiClient.updateDataSubjectRequest(
        activeClinicId,
        request.id,
        {
          status: request.status === "fulfilled" ? "in_review" : "fulfilled",
          resolution:
            request.status === "fulfilled"
              ? "Reabierta para revision."
              : request.resolution || "Gestionada desde el centro de compliance.",
        },
        idToken ?? undefined,
      );
    },
    onSuccess: invalidateCompliance,
  });

  return (
    <RoleGuard allowed={["clinic_admin"]} allowPlatformAdmin>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{t("compliance.subtitle")}</p>
          <h1 className="text-2xl font-semibold text-primary">{t("compliance.title")}</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {checklistQuery.data?.checks.map((check) => (
            <Card key={check.id} className="border-primary/10">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    {check.label}
                  </span>
                  <Badge variant={statusVariant(check.status) as any}>{check.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{check.detail}</p>
              </CardContent>
            </Card>
          ))}
          {!checklistQuery.data?.checks.length ? (
            <Card className="lg:col-span-3">
              <CardContent className="py-6 text-sm text-muted-foreground">
                {t("compliance.loadingChecklist")}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              {t("compliance.securityPolicies")}
            </CardTitle>
            <Button size="sm" onClick={() => policyMutation.mutate()} disabled={policyMutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {t("action.save")}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={policy.mfaRequiredForAdmins}
                onChange={(event) =>
                  setPolicy((prev) => ({ ...prev, mfaRequiredForAdmins: event.target.checked }))
                }
              />
              {t("compliance.requireMfaAdmins")}
            </label>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={policy.mfaRequiredForProfessionals}
                onChange={(event) =>
                  setPolicy((prev) => ({
                    ...prev,
                    mfaRequiredForProfessionals: event.target.checked,
                  }))
                }
              />
              {t("compliance.requireMfaProfessionals")}
            </label>
            <div className="space-y-1">
              <Label>{t("compliance.sessionTimeout")}</Label>
              <Input
                type="number"
                min={5}
                max={240}
                value={policy.sessionTimeoutMinutes}
                onChange={(event) =>
                  setPolicy((prev) => ({
                    ...prev,
                    sessionTimeoutMinutes: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>{t("compliance.clinicalRetention")}</Label>
              <Input
                type="number"
                min={10}
                max={99}
                value={policy.clinicalRecordRetentionYears}
                onChange={(event) =>
                  setPolicy((prev) => ({
                    ...prev,
                    clinicalRecordRetentionYears: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>{t("compliance.backupFrequency")}</Label>
              <Select
                value={policy.backupFrequency}
                onChange={(event) =>
                  setPolicy((prev) => ({
                    ...prev,
                    backupFrequency: event.target.value as PolicyForm["backupFrequency"],
                  }))
                }
              >
                <option value="daily">{t("compliance.daily")}</option>
                <option value="weekly">{t("compliance.weekly")}</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("compliance.backupRetention")}</Label>
              <Input
                type="number"
                min={7}
                max={3650}
                value={policy.backupRetentionDays}
                onChange={(event) =>
                  setPolicy((prev) => ({
                    ...prev,
                    backupRetentionDays: Number(event.target.value),
                  }))
                }
              />
            </div>
            {digitalSignatureEnabled ? (
              <div className="space-y-1">
                <Label>{t("compliance.signatureMode")}</Label>
                <Select
                  value={policy.digitalSignatureMode}
                  onChange={(event) =>
                    setPolicy((prev) => ({
                      ...prev,
                      digitalSignatureMode: event.target.value as PolicyForm["digitalSignatureMode"],
                    }))
                  }
                >
                  <option value="pending_provider">{t("compliance.pendingProvider")}</option>
                  <option value="electronic_signature">{t("compliance.electronicSignature")}</option>
                  <option value="certified_digital_signature">{t("compliance.certifiedSignature")}</option>
                </Select>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-center gap-2 font-semibold">
                  <Lock className="h-4 w-4" />
                  {t("compliance.signatureLocked")}
                </div>
                <p className="mt-1">
                  {t("compliance.signatureLockedDetail")}
                </p>
              </div>
            )}
            <div className="space-y-1">
              <Label>{t("compliance.cloudProvider")}</Label>
              <Input
                value={policy.internationalTransferProvider}
                onChange={(event) =>
                  setPolicy((prev) => ({
                    ...prev,
                    internationalTransferProvider: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>{t("compliance.cloudSafeguards")}</Label>
              <Textarea
                value={policy.internationalTransferSafeguards}
                onChange={(event) =>
                  setPolicy((prev) => ({
                    ...prev,
                    internationalTransferSafeguards: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>{t("compliance.privacyContact")}</Label>
              <Input
                placeholder="privacidad@clinica.com"
                value={policy.dataProtectionContact}
                onChange={(event) =>
                  setPolicy((prev) => ({ ...prev, dataProtectionContact: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label>{t("compliance.incidentContact")}</Label>
              <Input
                placeholder="seguridad@clinica.com"
                value={policy.incidentResponseContact}
                onChange={(event) =>
                  setPolicy((prev) => ({ ...prev, incidentResponseContact: event.target.value }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DatabaseBackup className="h-4 w-4" />
                {t("compliance.backupEvidence")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  placeholder={t("compliance.provider")}
                  value={backupForm.provider}
                  onChange={(event) =>
                    setBackupForm((prev) => ({ ...prev, provider: event.target.value }))
                  }
                />
                <Input
                  placeholder={t("compliance.location")}
                  value={backupForm.location}
                  onChange={(event) =>
                    setBackupForm((prev) => ({ ...prev, location: event.target.value }))
                  }
                />
                <Select
                  value={backupForm.status}
                  onChange={(event) =>
                    setBackupForm((prev) => ({
                      ...prev,
                      status: event.target.value as BackupEvent["status"],
                    }))
                  }
                >
                  <option value="verified">{t("compliance.verified")}</option>
                  <option value="success">{t("compliance.success")}</option>
                  <option value="failed">{t("compliance.failed")}</option>
                </Select>
              </div>
              <Textarea
                placeholder={t("compliance.backupDetailPlaceholder")}
                value={backupForm.detail}
                onChange={(event) =>
                  setBackupForm((prev) => ({ ...prev, detail: event.target.value }))
                }
              />
              <Button
                size="sm"
                onClick={() => backupMutation.mutate()}
                disabled={backupMutation.isPending || backupForm.detail.trim().length < 4}
              >
                {t("compliance.registerEvidence")}
              </Button>
              <div className="space-y-2">
                {backupQuery.data?.slice(0, 5).map((event) => (
                  <div key={event.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{event.provider}</span>
                      <Badge variant={statusVariant(event.status) as any}>{event.status}</Badge>
                    </div>
                    <p className="text-muted-foreground">{event.detail}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(event.createdAt ?? "")}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileWarning className="h-4 w-4" />
                {t("compliance.dataRequests")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Select
                  value={requestForm.type}
                  onChange={(event) =>
                    setRequestForm((prev) => ({
                      ...prev,
                      type: event.target.value as DataSubjectRequestType,
                    }))
                  }
                >
                  {(Object.keys(requestTypeLabels) as DataSubjectRequestType[]).map((value) => (
                    <option key={value} value={value}>
                      {requestLabel(value)}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder={t("compliance.patientOrEmail")}
                  value={requestForm.patientId}
                  onChange={(event) =>
                    setRequestForm((prev) => ({ ...prev, patientId: event.target.value }))
                  }
                />
                <Input
                  placeholder={t("compliance.subjectEmail")}
                  value={requestForm.subjectEmail}
                  onChange={(event) =>
                    setRequestForm((prev) => ({ ...prev, subjectEmail: event.target.value }))
                  }
                />
              </div>
              <Textarea
                placeholder={t("compliance.requestDetailPlaceholder")}
                value={requestForm.description}
                onChange={(event) =>
                  setRequestForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
              <Button
                size="sm"
                onClick={() => requestMutation.mutate()}
                disabled={requestMutation.isPending || requestForm.description.trim().length < 8}
              >
                {t("compliance.registerRequest")}
              </Button>
              <div className="space-y-2">
                {requestsQuery.data?.slice(0, 8).map((request) => (
                  <div key={request.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{requestLabel(request.type)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t("compliance.due")}: {formatDate(request.dueAt ?? "")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant(request.status) as any}>{request.status}</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolveRequestMutation.mutate(request)}
                        >
                          {request.status === "fulfilled" ? t("compliance.reopen") : t("compliance.fulfilled")}
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 text-muted-foreground">{request.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </RoleGuard>
  );
}
