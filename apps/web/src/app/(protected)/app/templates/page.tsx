"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Mails, Send } from "lucide-react";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Textarea } from "../../../../components/ui/textarea";
import { Select } from "../../../../components/ui/select";
import { useClinic } from "../../../../providers/clinic-provider";

export default function TemplatesPage() {
  const { activeClinicId } = useClinic();
  const qc = useQueryClient();
  const templatesQuery = useAuthedQuery({
    queryKey: ["templates", activeClinicId],
    queryFn: (token, clinicId) => apiClient.templates(clinicId, token),
  });

  const [form, setForm] = useState({ name: "", channel: "whatsapp", body: "" });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error("Sin espacio");
      await new Promise((res) => setTimeout(res, 400));
      templatesQuery.data?.push({
        id: crypto.randomUUID(),
        name: form.name,
        channel: form.channel as "whatsapp" | "email",
        body: form.body,
        clinicId: activeClinicId,
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates", activeClinicId] });
      setForm({ name: "", channel: "whatsapp", body: "" });
    },
  });

  const renderAction = (body: string, channel: string) => {
    if (channel === "whatsapp") {
      return (
        <Button variant="secondary" size="sm" asChild>
          <a href={`https://wa.me/?text=${encodeURIComponent(body)}`} target="_blank" rel="noreferrer">
            <MessageCircle className="mr-2 h-4 w-4" />
            WhatsApp
          </a>
        </Button>
      );
    }
    return (
      <Button variant="outline" size="sm" asChild>
        <a href={`mailto:?body=${encodeURIComponent(body)}`}>
          <Mails className="mr-2 h-4 w-4" />
          Email
        </a>
      </Button>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Plantillas y recordatorios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {templatesQuery.data?.map((tpl) => (
            <div key={tpl.id} className="rounded-xl border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{tpl.name}</p>
                  <p className="text-xs uppercase text-muted-foreground">{tpl.channel}</p>
                </div>
                {renderAction(tpl.body, tpl.channel)}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{tpl.body}</p>
            </div>
          ))}
          {!templatesQuery.data?.length ? <p className="text-sm text-muted-foreground">Aún no creaste plantillas.</p> : null}
        </CardContent>
      </Card>

      <Card className="self-start border-primary/10 shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="h-4 w-4" />
            Nueva plantilla
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Recordatorio de turno" />
          </div>
          <div className="space-y-1">
            <Label>Canal</Label>
            <Select value={form.channel} onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Mensaje</Label>
            <Textarea
              rows={5}
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              placeholder="Hola {{patientName}}, tu turno es el {{date}} con {{professionalName}}."
            />
          </div>
          <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            Guardar
          </Button>
          {createMutation.error ? <p className="text-sm text-destructive">No pudimos crear la plantilla.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
