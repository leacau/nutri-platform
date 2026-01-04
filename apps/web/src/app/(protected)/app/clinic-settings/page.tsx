"use client";

import { useState } from "react";
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

export default function ClinicSettingsPage() {
  const { activeClinicId } = useClinic();
  const qc = useQueryClient();
  const settingsQuery = useAuthedQuery({
    queryKey: ["clinic-settings", activeClinicId],
    queryFn: (token, clinicId) => apiClient.clinicSettings(clinicId, token),
  });

  const [form, setForm] = useState({ logoUrl: "", accentColor: "" });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error("Sin clínica");
      return apiClient.saveClinicSettings(
        activeClinicId,
        {
          branding: {
            logoUrl: form.logoUrl || undefined,
            accentColor: form.accentColor || undefined,
          },
        },
        undefined,
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
          </CardContent>
          {mutation.error ? <p className="px-6 pb-4 text-sm text-destructive">No pudimos guardar los cambios.</p> : null}
        </Card>
      </div>
    </RoleGuard>
  );
}
