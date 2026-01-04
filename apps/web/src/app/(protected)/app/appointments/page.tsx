"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock3, PlusCircle } from "lucide-react";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Select } from "../../../../components/ui/select";
import { formatDate } from "../../../../lib/utils";
import { usePermissions } from "../../../../hooks/use-permissions";
import { useClinic } from "../../../../providers/clinic-provider";
import { useAuth } from "../../../../providers/auth-provider";

export default function AppointmentsPage() {
  const qc = useQueryClient();
  const perms = usePermissions();
  const { activeClinicId } = useClinic();
  const { idToken } = useAuth();
  const [filterStatus, setFilterStatus] = useState("all");
  const [newAppointment, setNewAppointment] = useState({
    patientId: "",
    nutriId: "",
    scheduledFor: "",
  });

  const appointmentsQuery = useAuthedQuery({
    queryKey: ["appointments"],
    queryFn: (token, clinicId) => apiClient.appointments(clinicId, token),
  });
  const patientsQuery = useAuthedQuery({
    queryKey: ["patients"],
    queryFn: (token, clinicId) => apiClient.patients(clinicId, token),
  });
  const nutrisQuery = useAuthedQuery({
    queryKey: ["nutris"],
    queryFn: (token, clinicId) => apiClient.nutris(clinicId, token),
    enabled: perms.canScheduleForOthers || perms.canSeeAllAppointments,
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!newAppointment.patientId || !newAppointment.nutriId || !newAppointment.scheduledFor) {
        throw new Error("Faltan datos");
      }
      return apiClient.scheduleAppointment(
        {
          ...newAppointment,
          status: "scheduled",
          requestedAt: new Date().toISOString(),
        },
        activeClinicId || "",
        idToken || undefined,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setNewAppointment({ patientId: "", nutriId: "", scheduledFor: "" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => apiClient.cancelAppointment(id, activeClinicId || "", idToken || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });

  const appointments = useMemo(() => {
    const list = appointmentsQuery.data || [];
    if (filterStatus === "all") return list;
    return list.filter((appt) => appt.status === filterStatus);
  }, [appointmentsQuery.data, filterStatus]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Vista semanal</p>
          <h1 className="text-2xl font-semibold text-primary">Turnos</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Total: {appointmentsQuery.data?.length ?? 0}</Badge>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-44">
            <option value="all">Todos</option>
            <option value="requested">Pendientes</option>
            <option value="scheduled">Programados</option>
            <option value="cancelled">Cancelados</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-4 w-4 text-primary" />
              Agenda
            </CardTitle>
            <Badge variant="secondary">Vista rápida</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {appointments.map((appt) => (
              <div key={appt.id} className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="font-semibold">Paciente {appt.patientId}</p>
                  <p className="text-xs text-muted-foreground">Nutri: {appt.nutriId}</p>
                  <Badge variant={appt.status === "requested" ? "warning" : appt.status === "cancelled" ? "outline" : "secondary"} className="mt-1">
                    {appt.status}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{appt.scheduledFor ? formatDate(appt.scheduledFor) : "Por programar"}</p>
                  <div className="mt-2 flex justify-end gap-2">
                    {appt.status !== "cancelled" ? (
                      <Button size="sm" variant="ghost" onClick={() => cancelMutation.mutate(appt.id)}>
                        Cancelar
                      </Button>
                    ) : null}
                    {appt.status === "requested" && perms.canScheduleForOthers ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setNewAppointment({
                            patientId: appt.patientId,
                            nutriId: appt.nutriId,
                            scheduledFor: new Date().toISOString().slice(0, 16),
                          })
                        }
                      >
                        Programar
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {!appointments.length ? <p className="text-sm text-muted-foreground">No hay turnos para el filtro.</p> : null}
          </CardContent>
        </Card>

        <Card className="self-start border-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PlusCircle className="h-4 w-4" />
              Programar turno
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Paciente</Label>
              <Select value={newAppointment.patientId} onChange={(e) => setNewAppointment({ ...newAppointment, patientId: e.target.value })}>
                <option value="">Elegí paciente</option>
                {patientsQuery.data?.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Nutricionista</Label>
              <Select value={newAppointment.nutriId} onChange={(e) => setNewAppointment({ ...newAppointment, nutriId: e.target.value })}>
                <option value="">Elegí nutri</option>
                {nutrisQuery.data?.map((nutri) => (
                  <option key={nutri.id} value={nutri.id}>
                    {nutri.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fecha y hora</Label>
              <Input
                type="datetime-local"
                value={newAppointment.scheduledFor}
                onChange={(e) => setNewAppointment({ ...newAppointment, scheduledFor: e.target.value })}
              />
            </div>
            <Button className="w-full" onClick={() => scheduleMutation.mutate()} disabled={scheduleMutation.isPending || !perms.canScheduleForOthers}>
              <Clock3 className="mr-2 h-4 w-4" />
              Guardar turno
            </Button>
            {!perms.canScheduleForOthers ? (
              <p className="text-xs text-muted-foreground">Solo podés editar tus turnos. Pedí a un admin para agendar otros.</p>
            ) : null}
            {scheduleMutation.error ? <p className="text-sm text-destructive">No pudimos programar el turno.</p> : null}
            {cancelMutation.error ? <p className="text-sm text-destructive">Error al cancelar.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
