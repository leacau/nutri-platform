"use client";

import { HeartPulse, NotebookText } from "lucide-react";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { formatDate } from "../../../../lib/utils";

export default function PortalDashboardPage() {
  const patientQuery = useAuthedQuery({
    queryKey: ["portal-patient"],
    queryFn: (token, clinicId) => apiClient.patient("patient_1", clinicId, token),
  });
  const appointmentsQuery = useAuthedQuery({
    queryKey: ["portal-appointments"],
    queryFn: (token, clinicId) => apiClient.appointments(clinicId, token),
  });

  const nextAppointment = appointmentsQuery.data?.find((appt) => appt.status === "scheduled");

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="border-primary/10 shadow-lg">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HeartPulse className="h-4 w-4" />
            Próximo turno
          </CardTitle>
          <Badge variant="secondary">Paciente</Badge>
        </CardHeader>
        <CardContent>
          {nextAppointment ? (
            <div>
              <p className="text-sm text-muted-foreground">Fecha</p>
              <p className="text-xl font-semibold">{formatDate(nextAppointment.scheduledFor || "")}</p>
              <p className="text-sm text-muted-foreground">
                Profesional asignado: {nextAppointment.professionalUid}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No tenés turnos programados.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <NotebookText className="h-4 w-4" />
            Tu perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">Nombre: {patientQuery.data?.name ?? "—"}</p>
          <p className="text-sm">Email: {patientQuery.data?.email ?? "—"}</p>
          <p className="text-sm">
            Profesionales: {patientQuery.data?.assignedProfessionalUids?.join(", ") ?? "—"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
