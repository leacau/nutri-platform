"use client";

import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { formatDate } from "../../../../lib/utils";

export default function PortalProfilePage() {
  const patientQuery = useAuthedQuery({
    queryKey: ["portal-patient-profile"],
    queryFn: (token, clinicId) => apiClient.patient("patient_1", clinicId, token),
  });

  const patient = patientQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Portal paciente</p>
        <h1 className="text-2xl font-semibold text-primary">Mi perfil</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Nombre</p>
            <p className="font-semibold">{patient?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-semibold">{patient?.email ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Teléfono</p>
            <p className="font-semibold">{patient?.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Nacimiento</p>
            <p className="font-semibold">{patient?.birthDate ? formatDate(patient.birthDate) : "—"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
