"use client";

import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { apiClient } from "../../../../lib/api-client";
import { RoleGuard } from "../../../../components/guards";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { formatDate } from "../../../../lib/utils";

export default function AuditPage() {
  const auditQuery = useAuthedQuery({
    queryKey: ["audit"],
    queryFn: (token, clinicId) => apiClient.audit(clinicId, token),
  });

  return (
    <RoleGuard allowed={["clinic_admin"]} allowPlatformAdmin>
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Log de eventos clave</p>
          <h1 className="text-2xl font-semibold text-primary">Auditoría</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Eventos recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditQuery.data?.map((evt) => (
              <div key={evt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                <div>
                  <p className="font-semibold">{evt.type}</p>
                  <p className="text-xs text-muted-foreground">{evt.detail}</p>
                  <Badge variant="outline" className="mt-1">
                    {evt.actorRole}
                  </Badge>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{evt.actor}</p>
                  <p>{formatDate(evt.createdAt)}</p>
                </div>
              </div>
            ))}
            {!auditQuery.data?.length ? <p className="text-sm text-muted-foreground">No hay eventos para mostrar.</p> : null}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  );
}
