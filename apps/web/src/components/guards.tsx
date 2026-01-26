"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "../providers/auth-provider";
import { useClinic } from "../providers/clinic-provider";
import { ClinicMembershipRole } from "../lib/types";
import { cn } from "../lib/utils";

function LoadingScreen({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p>{label}</p>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?next=" + encodeURIComponent(pathname || "/app/dashboard"));
    }
  }, [loading, user, router, pathname]);

  if (loading || (!user && typeof window !== "undefined")) {
    return <LoadingScreen label="Validando sesión..." />;
  }

  if (!user) return null;
  return <>{children}</>;
}

export function ClinicGuard({ children }: { children: React.ReactNode }) {
  const { activeClinicId, isLoading, platformRole } = useClinic();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !activeClinicId) {
      const target =
        platformRole === "platform_admin" ? "/admin/clinics" : "/select-clinic";
      router.push(target + "?next=" + encodeURIComponent(pathname || "/app/dashboard"));
    }
  }, [activeClinicId, isLoading, router, pathname, platformRole]);

  if (isLoading || (!activeClinicId && typeof window !== "undefined")) {
    return <LoadingScreen label="Seleccioná una clínica para continuar" />;
  }

  if (!activeClinicId) return null;
  return <>{children}</>;
}

type RoleGuardProps = {
  allowed: ClinicMembershipRole[];
  allowPlatformAdmin?: boolean;
  children: React.ReactNode;
};

export function RoleGuard({ allowed, allowPlatformAdmin = false, children }: RoleGuardProps) {
  const { activeMembership, platformRole } = useClinic();
  const permitted = activeMembership && allowed.includes(activeMembership.role);
  const platformAllowed = allowPlatformAdmin && platformRole === "platform_admin";

  if (!permitted && !platformAllowed) {
    return (
      <div className={cn("glass-panel mx-auto my-12 max-w-xl rounded-2xl p-10 text-center")}>
        <h2 className="text-xl font-semibold text-primary">Acceso restringido</h2>
        <p className="mt-2 text-sm text-muted-foreground">No tenés permisos para ver este módulo en la clínica activa.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function Protected({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <ClinicGuard>{children}</ClinicGuard>
    </AuthGuard>
  );
}
