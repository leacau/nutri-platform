"use client";

import { ArrowUpRight, CalendarRange, ClipboardCheck, Users } from "lucide-react";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { formatDate } from "../../../../lib/utils";
import { useClinic } from "../../../../providers/clinic-provider";

export default function DashboardPage() {
  const patientsQuery = useAuthedQuery({
    queryKey: ["patients", "dashboard"],
    queryFn: (token, clinicId) => apiClient.patients(clinicId, token),
  });
  const appointmentsQuery = useAuthedQuery({
    queryKey: ["appointments", "dashboard"],
    queryFn: (token, clinicId) => apiClient.appointments(clinicId, token),
  });

  const { activeClinic } = useClinic();

  const patients = patientsQuery.data || [];
  const appointments = appointmentsQuery.data || [];
  const scheduled = appointments.filter((a) => a.status === "scheduled");
  const requested = appointments.filter((a) => a.status === "requested");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Bienvenido a AMSA Core</p>
        <h1 className="text-3xl font-semibold text-primary">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Clínica activa: {activeClinic?.name ?? "—"}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pacientes activos</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{patients.length}</div>
            <p className="text-xs text-muted-foreground">Asignados en esta clínica</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Turnos programados</CardTitle>
            <CalendarRange className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{scheduled.length}</div>
            <p className="text-xs text-muted-foreground">Incluye propios y de tu equipo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Solicitudes pendientes</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{requested.length}</div>
            <p className="text-xs text-muted-foreground">Listas para agendar</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="text-lg">Turnos próximos</CardTitle>
          <Badge variant="secondary" className="flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" />
            Calendario semanal
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {scheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay turnos programados. ¡Agenda el próximo!</p>
          ) : (
            <div className="space-y-2">
              {scheduled.slice(0, 4).map((appt) => (
                <div key={appt.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Paciente {appt.patientId}</p>
                    <p className="text-xs text-muted-foreground">Nutri: {appt.nutriId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{appt.scheduledFor ? formatDate(appt.scheduledFor) : "Sin fecha"}</p>
                    <p className="text-xs text-muted-foreground uppercase">{appt.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
