import { AppShell } from "../../../components/app-shell";
import { Protected } from "../../../components/guards";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Protected>
      <AppShell>{children}</AppShell>
    </Protected>
  );
}
