import { ClientShell } from "@/components/layout/client-shell";
import { requireRole } from "@/lib/dal";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["client"]);

  return <ClientShell userName={profile.full_name}>{children}</ClientShell>;
}
