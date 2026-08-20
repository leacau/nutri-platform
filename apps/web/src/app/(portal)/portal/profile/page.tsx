"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";

import { apiClient } from "../../../../lib/api-client";
import { formatDate } from "../../../../lib/utils";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { useClinic } from "../../../../providers/clinic-provider";
import { useI18n } from "../../../../providers/i18n-provider";

export default function PortalProfilePage() {
  const { activeClinicId, me } = useClinic();
  const { t } = useI18n();
  const patientMembership = me?.memberships.find(
    (membership) =>
      membership.clinicId === activeClinicId && membership.role === "patient",
  );
  const patientId = patientMembership?.patientId;

  const patientQuery = useAuthedQuery({
    queryKey: ["portal-patient-profile", patientId],
    queryFn: (token, clinicId) =>
      apiClient.patient(patientId!, clinicId, token, "patient"),
    enabled: Boolean(patientId),
  });

  const patient = patientQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{t("portal.title")}</p>
        <h1 className="text-2xl font-semibold text-primary">{t("portal.profile")}</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("portal.data")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">{t("common.name")}</p>
            <p className="font-semibold">{patient?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-semibold">{patient?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("common.phone")}</p>
            <p className="font-semibold">{patient?.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("common.birthDate")}</p>
            <p className="font-semibold">
              {patient?.birthDate ? formatDate(patient.birthDate) : "—"}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
