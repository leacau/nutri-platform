"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus2 } from "lucide-react";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import { RoleGuard } from "../../../../components/guards";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";

export default function NutritionistsPage() {
  const qc = useQueryClient();
  const nutrisQuery = useAuthedQuery({
    queryKey: ["nutris"],
    queryFn: (token, clinicId) => apiClient.nutris(clinicId, token),
  });

  const [form, setForm] = useState({ name: "", email: "" });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      // placeholder - backend invite not defined
      await new Promise((res) => setTimeout(res, 600));
      return { ok: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nutris"] });
      setForm({ name: "", email: "" });
    },
  });

  return (
    <RoleGuard allowed={["clinic_admin"]}>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Solo clinic_admin</p>
          <h1 className="text-2xl font-semibold text-primary">Nutricionistas</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Equipo de nutris</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {nutrisQuery.data?.map((nutri) => (
                <div key={nutri.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold">{nutri.name}</p>
                    <p className="text-xs text-muted-foreground">{nutri.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{nutri.role}</span>
                </div>
              ))}
              {!nutrisQuery.data?.length ? <p className="p-4 text-sm text-muted-foreground">No hay nutris cargados.</p> : null}
            </CardContent>
          </Card>

          <Card className="self-start border-primary/10 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserPlus2 className="h-4 w-4" />
                Invitar nutri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Nombre</Label>
                  <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Nombre" />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="nutri@clinica.com"
                  />
                </div>
                <Button className="w-full" onClick={() => inviteMutation.mutate()} disabled={inviteMutation.isPending}>
                  Enviar invitación
                </Button>
                {inviteMutation.error ? <p className="text-sm text-destructive">No pudimos enviar la invitación.</p> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </RoleGuard>
  );
}
