"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CalendarClock, ClipboardList, FileText, LayoutDashboard, LogOut, Settings, Shield, UserCircle, Users } from "lucide-react";
import { ReactNode } from "react";
import { useClinic } from "../providers/clinic-provider";
import { usePermissions } from "../hooks/use-permissions";
import { useAuth } from "../providers/auth-provider";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { ClinicSwitcher } from "./clinic-switcher";
import { LanguageSelector } from "./language-selector";
import { ThemeToggle } from "./theme-toggle";
import { DevToolsPanel } from "./dev-tools-panel";

type NavItem = {
  label: string;
  href: string;
  icon: ReactNode;
  roles?: string[];
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { label: "Pacientes", href: "/app/patients", icon: <Users className="h-4 w-4" />, roles: ["clinic_admin", "staff", "professional"] },
  { label: "Turnos", href: "/app/appointments", icon: <CalendarClock className="h-4 w-4" />, roles: ["clinic_admin", "staff", "professional"] },
  { label: "Profesionales", href: "/app/nutritionists", icon: <UserCircle className="h-4 w-4" />, roles: ["clinic_admin", "staff"] },
  { label: "Staff", href: "/app/staff", icon: <Users className="h-4 w-4" />, roles: ["clinic_admin"] },
  { label: "Plantillas", href: "/app/templates", icon: <FileText className="h-4 w-4" />, roles: ["clinic_admin", "staff", "professional"] },
  { label: "Auditoría", href: "/app/audit", icon: <Shield className="h-4 w-4" />, roles: ["clinic_admin", "platform_admin"] },
  { label: "Configuración", href: "/app/clinic-settings", icon: <Settings className="h-4 w-4" />, roles: ["clinic_admin"] },
  { label: "Portal paciente", href: "/portal/dashboard", icon: <ClipboardList className="h-4 w-4" />, roles: ["patient"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { activeMembership, platformRole } = useClinic();
  const { logout } = useAuth();
  const router = useRouter();
  const perms = usePermissions();

  const currentRole = activeMembership?.role;

  const filteredNav = navItems.filter((item) => {
    if (!item.roles) return true;
    if (platformRole === "platform_admin" && item.href !== "/portal/dashboard") return true;
    return currentRole ? item.roles.includes(currentRole) : false;
  });

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 flex-col border-r bg-white/80 backdrop-blur lg:flex">
        <div className="flex items-center gap-3 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">AC</div>
          <div>
            <p className="text-sm font-semibold text-primary">AMSA Core</p>
            <p className="text-xs text-muted-foreground">{activeMembership?.clinicName ?? "Sin clínica"}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {filteredNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-primary/5 hover:text-primary",
                pathname?.startsWith(item.href) ? "bg-primary/10 text-primary" : "",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-2 px-4 pb-4">
          <div className="rounded-xl border bg-gradient-to-r from-primary/10 to-secondary/10 px-3 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 text-primary">
              <BarChart3 className="h-4 w-4" />
              <span>Estado</span>
            </div>
            <p>Rol actual: {currentRole || "N/D"}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => router.push("/select-clinic")}>
            Cambiar clínica
          </Button>
          <Button variant="ghost" className="w-full" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/70 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <ClinicSwitcher />
            {perms.canViewAudit ? <span className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">Modo admin</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 px-4 py-6">
          {children}
          <DevToolsPanel />
        </main>
      </div>
    </div>
  );
}
