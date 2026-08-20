import { AdminShell } from "@/components/layout/admin-shell";
import { requireRole } from "@/lib/dal";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin", "advogado"]);

  return (
    <AdminShell userName={profile.full_name} userRole={profile.role}>
      {children}
    </AdminShell>
  );
}
