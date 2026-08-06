"use client";

import { ImagePlus, Lock, Palette, Save } from "lucide-react";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "../../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { RoleGuard } from "../../../../components/guards";
import { apiClient } from "../../../../lib/api-client";
import { getFirebaseApp } from "../../../../lib/firebase";
import { useAuth } from "../../../../providers/auth-provider";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { useClinic } from "../../../../providers/clinic-provider";
import { useI18n } from "../../../../providers/i18n-provider";

export default function ClinicSettingsPage() {
  const { activeClinicId, activeClinic, platformRole } = useClinic();
  const { idToken } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const customBrandingEnabled =
    platformRole === "platform_admin" ||
    activeClinic?.billing?.enabledModules?.customBranding === true;

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
  const [logoDraft, setLogoDraft] = useState<{
    src: string;
    fileName: string;
    warning?: string;
  } | null>(null);
  const [logoZoom, setLogoZoom] = useState(1);
  const [logoOffset, setLogoOffset] = useState({ x: 0, y: 0 });
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");

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

  useEffect(() => {
    if (!logoDraft) {
      setLogoPreviewUrl(form.logoUrl);
      return;
    }

    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const size = 256;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);

      const baseScale = Math.max(size / image.width, size / image.height);
      const scale = baseScale * logoZoom;
      const width = image.width * scale;
      const height = image.height * scale;
      const x = (size - width) / 2 + logoOffset.x;
      const y = (size - height) / 2 + logoOffset.y;

      ctx.drawImage(image, x, y, width, height);
      setLogoPreviewUrl(canvas.toDataURL("image/png"));
    };
    image.src = logoDraft.src;
  }, [form.logoUrl, logoDraft, logoOffset.x, logoOffset.y, logoZoom]);

  const handleLogoFile = (file?: File | null) => {
    if (!file) return;
    if (!customBrandingEnabled) {
      alert(t("settings.brandingLockedDetail"));
      return;
    }
    if (!file.type.startsWith("image/")) {
      alert(t("settings.logoMustBeImage"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setLogoDraft({
        src: String(reader.result),
        fileName: file.name,
        warning:
          file.size > 2 * 1024 * 1024
            ? t("settings.logoCompressWarning")
            : undefined,
      });
      setLogoZoom(1);
      setLogoOffset({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const uploadLogoIfNeeded = async () => {
    if (!logoDraft || !logoPreviewUrl || !activeClinicId) return form.logoUrl;

    const blob = await fetch(logoPreviewUrl).then((res) => res.blob());
    if (blob.size > 2 * 1024 * 1024) {
      throw new Error(t("settings.logoTooLarge"));
    }

    const storage = getStorage(getFirebaseApp());
    const safeName = logoDraft.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageRef = ref(
      storage,
      `clinics/${activeClinicId}/branding/logo-${Date.now()}-${safeName}.png`,
    );
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: "image/png",
      cacheControl: "public, max-age=31536000",
    });
    return getDownloadURL(snapshot.ref);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeClinicId) throw new Error("Sin espacio");
      const finalLogoUrl = customBrandingEnabled ? await uploadLogoIfNeeded() : form.logoUrl;
      return apiClient.saveClinicSettings(
        activeClinicId,
        {
          name: form.name || undefined,
          ...(customBrandingEnabled
            ? {
                branding: {
                  logoUrl: finalLogoUrl || undefined,
                  accentColor: form.accentColor || undefined,
                },
              }
            : {}),
          patientAppointmentSelfService: {
            canCancel: form.canCancel,
            canReschedule: form.canReschedule,
            minHoursBefore: Number(form.minHoursBefore) || 24,
          },
        },
        idToken ?? undefined,
      );
    },
    onSuccess: (settings) => {
      setForm((prev) => ({
        ...prev,
        logoUrl: settings.branding?.logoUrl ?? prev.logoUrl,
      }));
      setLogoDraft(null);
      qc.invalidateQueries({ queryKey: ["clinic-settings", activeClinicId] });
      qc.invalidateQueries({ queryKey: ["clinic-detail", activeClinicId] });
      qc.invalidateQueries({ queryKey: ["clinics"] });
    },
  });

  return (
    <RoleGuard allowed={["clinic_admin"]}>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
          <h1 className="text-2xl font-semibold text-primary">{t("settings.title")}</h1>
        </div>
        <Card className="border-primary/10 shadow-lg">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              {t("settings.branding")}
            </CardTitle>
            <Button size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {t("action.save")}
            </Button>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label>{t("settings.name")}</Label>
              <Input
                placeholder="Clinica AMSA"
                value={form.name || settingsQuery.data?.name || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            {!customBrandingEnabled ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:col-span-2">
                <div className="flex items-center gap-2 font-semibold">
                  <Lock className="h-4 w-4" />
                  {t("settings.brandingLocked")}
                </div>
                <p className="mt-1">{t("settings.brandingLockedDetail")}</p>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>{t("settings.logoUrl")}</Label>
              <Input
                placeholder="https://..."
                value={form.logoUrl || settingsQuery.data?.branding?.logoUrl || ""}
                disabled={!customBrandingEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, logoUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("settings.uploadLogo")}</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground hover:bg-muted">
                <ImagePlus className="h-4 w-4" />
                {t("settings.pickImage")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={!customBrandingEnabled}
                  onChange={(e) => handleLogoFile(e.target.files?.[0])}
                />
              </label>
              <p className="text-xs text-muted-foreground">{t("settings.logoHelp")}</p>
            </div>
            <div className="space-y-1">
              <Label>{t("settings.accentColor")}</Label>
              <Input
                placeholder="#2F8F7B"
                value={form.accentColor || settingsQuery.data?.branding?.accentColor || ""}
                disabled={!customBrandingEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, accentColor: e.target.value }))}
              />
            </div>
            <div className="space-y-3 rounded-md border p-3 sm:col-span-2">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border bg-white">
                  {logoPreviewUrl ? (
                    <img src={logoPreviewUrl} alt={t("settings.logoPreviewAlt")} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("settings.noLogo")}</span>
                  )}
                </div>
                <div className="min-w-[220px] flex-1 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">{t("settings.preview")}</p>
                  {logoDraft?.warning ? (
                    <p className="text-amber-700">{logoDraft.warning}</p>
                  ) : (
                    <p>{t("settings.previewDetail")}</p>
                  )}
                </div>
              </div>
              {customBrandingEnabled && logoDraft ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>{t("settings.zoom")}</Label>
                    <Input
                      type="range"
                      min={1}
                      max={3}
                      step={0.05}
                      value={logoZoom}
                      onChange={(e) => setLogoZoom(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("settings.horizontal")}</Label>
                    <Input
                      type="range"
                      min={-96}
                      max={96}
                      value={logoOffset.x}
                      onChange={(e) =>
                        setLogoOffset((prev) => ({ ...prev, x: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{t("settings.vertical")}</Label>
                    <Input
                      type="range"
                      min={-96}
                      max={96}
                      value={logoOffset.y}
                      onChange={(e) =>
                        setLogoOffset((prev) => ({ ...prev, y: Number(e.target.value) }))
                      }
                    />
                  </div>
                </div>
              ) : null}
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={form.canCancel}
                onChange={(e) => setForm((prev) => ({ ...prev, canCancel: e.target.checked }))}
              />
              {t("settings.canCancel")}
            </label>
            <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
              <input
                type="checkbox"
                checked={form.canReschedule}
                onChange={(e) => setForm((prev) => ({ ...prev, canReschedule: e.target.checked }))}
              />
              {t("settings.canReschedule")}
            </label>
            <div className="space-y-1">
              <Label>{t("settings.minHoursBefore")}</Label>
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
          {mutation.error ? (
            <p className="px-6 pb-4 text-sm text-destructive">{t("settings.saveError")}</p>
          ) : null}
        </Card>
      </div>
    </RoleGuard>
  );
}
