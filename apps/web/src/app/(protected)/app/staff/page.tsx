"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldPlus } from "lucide-react";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import { RoleGuard } from "../../../../components/guards";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Label } from "../../../../components/ui/label";
import { Input } from "../../../../components/ui/input";

export default function StaffPage() {
  const qc = useQueryClient();
  const staffQuery = useAuthedQuery({
    queryKey: ["staff"],
    queryFn: (token, clinicId) => apiClient.staff(clinicId, token),
  });

  const [form, setForm] = useState({ name: "", email: "" });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      await new Promise((res) => setTimeout(res, 600));
      return { ok: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff"] });
      setForm({ name: "", email: "" });
    },
  });

  return (
    <RoleGuard allowed={["clinic_admin"]}>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Solo clinic_admin</p>
          <h1 className="text-2xl font-semibold text-primary">Staff</h1>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Equipo de staff</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {staffQuery.data?.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold">{member.name}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
                </div>
              ))}
              {!staffQuery.data?.length ? <p className="p-4 text-sm text-muted-foreground">No hay staff cargado.</p> : null}
            </CardContent>
          </Card>

          <Card className="self-start border-primary/10 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldPlus className="h-4 w-4" />
                Invitar staff
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
                    placeholder="staff@clinica.com"
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
