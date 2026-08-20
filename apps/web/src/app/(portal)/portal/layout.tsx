import PortalLayoutClient from "./portal-layout-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayoutClient>{children}</PortalLayoutClient>;
}
