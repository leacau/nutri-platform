"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Palette, Save } from "lucide-react";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import { RoleGuard } from "../../../../components/guards";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Button } from "../../../../components/ui/button";
import { useClinic } from "../../../../providers/clinic-provider";
import { useAuth } from "../../../../providers/auth-provider";

export default function ClinicSettingsPage() {
  const { activeClinicId } = useClinic();
  const { idToken } = useAuth();
  const qc = useQueryClient();
  const settingsQuery = useAuthedQuery({
    queryKey: ["clinic-settings", activeClinicId],
    queryFn: (token, clinicId) => apiClient.clinicSettings(clinicId, token),
  });

  const [form, setForm] = useState({
    name: "",
    logoUrl: "",
    accentColor: "",
    canCancel: true,
    canReschedule: false,
    minHoursBefore: 24,
  });

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    setForm({
      name: settings.name ?? "",
      logoUrl: settings.branding?.logoUrl ?? "",
      accentColor: settings.branding?.accentColor ?? "",
      canCancel: settings.patientAppointmentSelfService?.canCancel ?? true,
      canReschedule: settings.patientAppointmentSelfService?.canReschedule ?? false,
      minHoursBefore: settings.patientAppointmentSelfService?.minHoursBefore ?? 24,
    });
  }, [settingsQuery.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error("Sin espacio");
      return apiClient.saveClinicSettings(
        activeClinicId,
        {
          name: form.name || undefined,
          branding: {
            logoUrl: form.logoUrl || undefined,
            accentColor: form.accentColor || undefined,
          },
          patientAppointmentSelfService: {
            canCancel: form.canCancel,
            canReschedule: form.canReschedule,
            minHoursBefore: Number(form.minHoursBefore) || 24,
          },
        },
        idToken ?? undefined,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clinic-settings", activeClinicId] }),
  });

  return (
    <RoleGuard allowed={["clinic_admin"]}>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Branding y recordatorios</p>
          <h1 className="text-2xl font-semibold text-primary">Configuración de clínica</h1>
        </div>
        <Card className="border-primary/10 shadow-lg">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Branding
            </CardTitle>
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              Guardar
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>Nombre de la clinica</Label>
              <Input
                placeholder="Clinica AMSA"
                value={form.name || settingsQuery.data?.name || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Logo URL</Label>
              <Input
                placeholder="https://..."
                value={form.logoUrl || settingsQuery.data?.branding?.logoUrl || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, logoUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Color de acento</Label>
              <Input
                placeholder="#2F8F7B"
                value={form.accentColor || settingsQuery.data?.branding?.accentColor || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, accentColor: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={form.canCancel}
                onChange={(e) => setForm((prev) => ({ ...prev, canCancel: e.target.checked }))}
              />
              Pacientes pueden cancelar turnos
            </label>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={form.canReschedule}
                onChange={(e) => setForm((prev) => ({ ...prev, canReschedule: e.target.checked }))}
              />
              Pacientes pueden reprogramar turnos
            </label>
            <div className="space-y-1">
              <Label>Horas minimas antes del turno</Label>
              <Input
                type="number"
                min={0}
                max={720}
                value={form.minHoursBefore}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, minHoursBefore: Number(e.target.value) }))
                }
              />
            </div>
          </CardContent>
          {mutation.error ? <p className="px-6 pb-4 text-sm text-destructive">No pudimos guardar los cambios.</p> : null}
        </Card>
      </div>
    </RoleGuard>
  );
}
