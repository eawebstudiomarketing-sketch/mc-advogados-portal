import { ClientShell } from "@/components/layout/client-shell";
import { requireRole } from "@/lib/dal";
import { getClient } from "@/lib/data/clients";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["client"]);
  // Constraint no banco garante client_id preenchido pra role 'client'.
  const client = profile.client_id ? await getClient(profile.client_id) : null;

  return (
    <ClientShell userName={profile.full_name} clientName={client?.name ?? "—"}>
      {children}
    </ClientShell>
  );
}
