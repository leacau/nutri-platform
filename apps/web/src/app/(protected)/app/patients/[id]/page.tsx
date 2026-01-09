"use client";

import { useParams } from "next/navigation";
import { useAuthedQuery } from "../../../../../hooks/use-authed-query";
import { apiClient } from "../../../../../lib/api-client";
import { Badge } from "../../../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../../components/ui/tabs";
import { formatDate } from "../../../../../lib/utils";

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const patientQuery = useAuthedQuery({
    queryKey: ["patient", params.id],
    queryFn: (token, clinicId) => apiClient.patient(params.id, clinicId, token),
  });
  const appointmentsQuery = useAuthedQuery({
    queryKey: ["patient-appointments", params.id],
    queryFn: (token, clinicId) => apiClient.appointments(clinicId, token),
  });

  const patient = patientQuery.data;
  const appointments = (appointmentsQuery.data || []).filter((appt) => appt.patientId === params.id);

  if (patientQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando ficha...</p>;
  }

  if (!patient) {
    return <p className="text-sm text-destructive">No encontramos este paciente en la clínica activa.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Paciente</p>
          <h1 className="text-2xl font-semibold text-primary">{patient.name}</h1>
          <p className="text-xs text-muted-foreground">{patient.email || "sin email"}</p>
        </div>
        <Badge variant="secondary">
          Asignado a: {patient.assignedProfessionalUids?.join(", ") ?? "N/D"}
        </Badge>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="measurements">Mediciones</TabsTrigger>
          <TabsTrigger value="objectives">Objetivos</TabsTrigger>
          <TabsTrigger value="appointments">Turnos</TabsTrigger>
          <TabsTrigger value="notes">Notas</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>Datos personales</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{patient.email || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Teléfono</p>
                <p className="font-medium">{patient.phone || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sexo</p>
                <p className="font-medium">{patient.sexo}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fecha de nacimiento</p>
                <p className="font-medium">{patient.birthDate ? formatDate(patient.birthDate) : "—"}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="measurements">
          <Card>
            <CardHeader>
              <CardTitle>Últimas mediciones</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {patient.measurements ? (
                Object.entries(patient.measurements).map(([key, value]) => (
                  <div key={key} className="rounded-lg border p-3">
                    <p className="text-xs uppercase text-muted-foreground">{key}</p>
                    <p className="text-lg font-semibold">{value ?? "—"}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Sin mediciones registradas.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="objectives">
          <Card>
            <CardHeader>
              <CardTitle>Objetivos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                Objetivo principal: <span className="font-semibold">{patient.objective?.objetivoPrincipal ?? "—"}</span>
              </p>
              <p className="text-sm">Peso objetivo: {patient.objective?.objetivoPeso ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{patient.objective?.notas ?? "Sin notas adicionales."}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appointments">
          <Card>
            <CardHeader>
              <CardTitle>Turnos del paciente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {appointments.map((appt) => (
                <div key={appt.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium capitalize">{appt.status}</p>
                    <p className="text-xs text-muted-foreground">Profesional: {appt.professionalUid}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{appt.scheduledFor ? formatDate(appt.scheduledFor) : "Por programar"}</p>
                    <p className="text-xs text-muted-foreground">Solicitado {formatDate(appt.requestedAt)}</p>
                  </div>
                </div>
              ))}
              {!appointments.length ? <p className="text-sm text-muted-foreground">Sin turnos cargados.</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle>Notas internas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{patient.notes || "Sin notas."}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
