"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "../providers/auth-provider";
import { useClinic } from "../providers/clinic-provider";
import { BillingModuleKey, ClinicMembershipRole } from "../lib/types";
import { cn } from "../lib/utils";
import { useI18n } from "../providers/i18n-provider";

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p>{label}</p>
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login?next=" + encodeURIComponent(pathname || "/app/dashboard"));
    }
  }, [loading, user, router, pathname]);

  if (loading || (!user && typeof window !== "undefined")) {
    return <LoadingScreen label={t("common.validatingSession")} />;
  }

  if (!user) return null;
  return <>{children}</>;
}

export function ClinicGuard({ children }: { children: React.ReactNode }) {
  const { activeClinicId, isLoading, platformRole } = useClinic();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !activeClinicId) {
      if (platformRole === "platform_admin") {
        router.push("/admin/clinics");
        return;
      }
      router.push("/select-clinic?next=" + encodeURIComponent(pathname || "/app/dashboard"));
    }
  }, [activeClinicId, isLoading, platformRole, router, pathname]);

  if (isLoading || (!activeClinicId && typeof window !== "undefined")) {
    return <LoadingScreen label={t("common.selectClinicToContinue")} />;
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
  const { t } = useI18n();
  const permitted = activeMembership && allowed.includes(activeMembership.role);
  const platformAllowed = allowPlatformAdmin && platformRole === "platform_admin";

  if (!permitted && !platformAllowed) {
    return (
      <div className={cn("glass-panel mx-auto my-12 max-w-xl rounded-2xl p-10 text-center")}>
        <h2 className="text-xl font-semibold text-primary">{t("common.restrictedAccess")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("common.noPermission")}</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function ModuleGuard({
  module,
  children,
  allowPlatformAdmin = false,
}: {
  module: BillingModuleKey;
  children: React.ReactNode;
  allowPlatformAdmin?: boolean;
}) {
  const { activeClinic, platformRole } = useClinic();
  const { t } = useI18n();
  const platformAllowed = allowPlatformAdmin && platformRole === "platform_admin";
  const enabled = activeClinic?.billing?.enabledModules?.[module] === true;

  if (!enabled && !platformAllowed) {
    return (
      <div className={cn("glass-panel mx-auto my-12 max-w-xl rounded-2xl p-10 text-center")}>
        <h2 className="text-xl font-semibold text-primary">{t("common.moduleNotIncluded")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("common.moduleNotIncludedDetail", { module: t(`module.${module}`) })}
        </p>
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
