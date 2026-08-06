"use client";

import { Badge } from "../../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card";
import { ModuleGuard, RoleGuard } from "../../../../components/guards";
import { apiClient } from "../../../../lib/api-client";
import { formatDate } from "../../../../lib/utils";
import { useAuthedQuery } from "../../../../hooks/use-authed-query";
import { useI18n } from "../../../../providers/i18n-provider";

export default function AuditPage() {
  const { t } = useI18n();
  const auditQuery = useAuthedQuery({
    queryKey: ["audit"],
    queryFn: (token, clinicId) => apiClient.audit(clinicId, token),
  });

  return (
    <RoleGuard allowed={["clinic_admin"]} allowPlatformAdmin>
      <ModuleGuard module="advancedAudit">
        <div className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground">{t("audit.subtitle")}</p>
            <h1 className="text-2xl font-semibold text-primary">{t("audit.title")}</h1>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>{t("audit.recentEvents")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {auditQuery.data?.map((evt) => (
                <div
                  key={evt.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
                >
                  <div>
                    <p className="font-semibold">{evt.type}</p>
                    <p className="text-xs text-muted-foreground">{evt.detail}</p>
                    <Badge variant="outline" className="mt-1">
                      {evt.actorRole}
                    </Badge>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <p>{evt.actorRole}</p>
                    <p>{formatDate(evt.createdAt)}</p>
                  </div>
                </div>
              ))}
              {!auditQuery.data?.length ? (
                <p className="text-sm text-muted-foreground">{t("audit.empty")}</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </ModuleGuard>
    </RoleGuard>
  );
}
