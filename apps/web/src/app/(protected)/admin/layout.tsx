import { AppShell } from "../../../components/app-shell";
import { AuthGuard } from "../../../components/guards";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
