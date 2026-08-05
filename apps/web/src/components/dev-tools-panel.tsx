"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Stethoscope } from "lucide-react";
import { useAuth } from "../providers/auth-provider";
import { useClinic } from "../providers/clinic-provider";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { apiClient } from "../lib/api-client";

export function DevToolsPanel() {
  const { idToken, refreshToken } = useAuth();
  const { activeClinicId, activeMembership } = useClinic();
  const [health, setHealth] = useState<string>("—");
  const [meDump, setMeDump] = useState<string>("");

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENV !== "dev") return;
    const fetchHealth = async () => {
      try {
        const res = await fetch((process.env.NEXT_PUBLIC_API_BASE_URL || "/api") + "/health");
        const text = await res.text();
        setHealth(text || res.status.toString());
      } catch {
        setHealth("sin conexión");
      }
    };
    fetchHealth();
  }, []);

  const handleMe = async () => {
    try {
      const data = await apiClient.me(idToken || undefined);
      setMeDump(JSON.stringify(data, null, 2));
    } catch (err) {
      setMeDump(String(err));
    }
  };

  if (process.env.NEXT_PUBLIC_ENV !== "dev") return null;

  return (
    <Card className="mt-8 border-dashed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Dev Tools (solo dev)</CardTitle>
        <Button size="sm" variant="outline" onClick={refreshToken}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refrescar token
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">ID Token</p>
            <p className="truncate font-mono text-xs">{idToken?.slice(0, 32) ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Espacio activo</p>
            <p className="font-medium">{activeClinicId ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Rol efectivo</p>
            <p className="font-medium">{activeMembership?.role ?? "—"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleMe}>
              /users/me
            </Button>
            <Button size="sm" variant="ghost" onClick={() => window.open("/api/health", "_blank")}>
              <Stethoscope className="mr-2 h-4 w-4" />
              /health
            </Button>
            <span className="text-xs text-muted-foreground">{health}</span>
          </div>
        </div>
        {meDump ? (
          <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <code>{meDump}</code>
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}
