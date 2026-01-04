"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, CheckCircle2 } from "lucide-react";
import { useClinic } from "../../providers/clinic-provider";
import { useAuth } from "../../providers/auth-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Protected } from "../../components/guards";
import { useI18n } from "../../providers/i18n-provider";

export default function SelectClinicPage() {
  const { clinics, me, setActiveClinic, activeClinicId } = useClinic();
  const { logout } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const next = searchParams.get("next") || "/app/dashboard";

  useEffect(() => {
    if (activeClinicId) {
      router.replace(next);
    }
  }, [activeClinicId, next, router]);

  const handleSelect = (clinicId: string) => {
    setActiveClinic(clinicId);
    router.push(next);
  };

  const roleLabel = (clinicId: string) => me?.memberships.find((m) => m.clinicId === clinicId)?.role;

  return (
    <Protected>
      <main className="mx-auto max-w-5xl px-6 py-14">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{t("clinic.select")}</p>
            <h1 className="text-3xl font-semibold text-primary">Clínica activa</h1>
          </div>
          <Button variant="ghost" onClick={logout}>
            Cerrar sesión
          </Button>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {clinics?.map((clinic) => (
            <Card key={clinic.id} className="border-primary/10 shadow-sm">
              <CardHeader className="flex flex-row items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">{clinic.name}</CardTitle>
                  <CardDescription>{clinic.branding?.accentColor ? `Color: ${clinic.branding.accentColor}` : "Branding default"}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <Badge variant="secondary">Rol: {roleLabel(clinic.id)}</Badge>
                <Button onClick={() => handleSelect(clinic.id)} variant="default">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Activar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        {!clinics?.length ? (
          <div className="mt-8 rounded-xl border border-dashed p-6 text-center text-muted-foreground">
            No encontramos clínicas disponibles para tu usuario.
          </div>
        ) : null}
      </main>
    </Protected>
  );
}
