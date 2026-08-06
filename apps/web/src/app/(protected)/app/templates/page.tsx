"use client";

import { MessageCircle, Mails, Send } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { ModuleGuard } from "../../../../components/guards";
import { Select } from "../../../../components/ui/select";
import { Textarea } from "../../../../components/ui/textarea";
import { apiClient } from "../../../../lib/api-client";
import { useAuth } from "../../../../providers/auth-provider";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { useClinic } from "../../../../providers/clinic-provider";
import { useI18n } from "../../../../providers/i18n-provider";

export default function TemplatesPage() {
  const { activeClinicId, activeClinic } = useClinic();
  const { idToken } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const automatedMessagingEnabled =
    activeClinic?.billing?.enabledModules?.automatedMessaging === true;
  const templatesQuery = useAuthedQuery({
    queryKey: ["templates", activeClinicId],
    queryFn: (token, clinicId) => apiClient.templates(clinicId, token),
    enabled: automatedMessagingEnabled,
  });

  const [form, setForm] = useState({ name: "", channel: "whatsapp", body: "" });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error("Sin espacio");
      if (!automatedMessagingEnabled) {
        throw new Error("Modulo no habilitado");
      }
      return apiClient.createMessageTemplate(
        activeClinicId,
        {
          name: form.name.trim(),
          channel: form.channel as "whatsapp" | "email",
          body: form.body.trim(),
        },
        idToken ?? undefined,
      );
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
    <ModuleGuard module="automatedMessaging">
      <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("templates.title")}</CardTitle>
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
            {!templatesQuery.data?.length ? (
              <p className="text-sm text-muted-foreground">{t("templates.empty")}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="self-start border-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Send className="h-4 w-4" />
              {t("templates.new")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>{t("auth.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t("templates.namePlaceholder")}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("templates.channel")}</Label>
              <Select value={form.channel} onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("templates.message")}</Label>
              <Textarea
                rows={5}
                value={form.body}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                placeholder={t("templates.messagePlaceholder")}
              />
            </div>
            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {t("action.save")}
            </Button>
            {createMutation.error ? (
              <p className="text-sm text-destructive">{t("templates.saveError")}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ModuleGuard>
  );
}
