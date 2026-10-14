import { AdminShell } from "@/components/layout/admin-shell";
import { getPermissoes, requireRole } from "@/lib/dal";
import { listClients } from "@/lib/data/clients";
import { contarNaoTratadas } from "@/lib/data/publicacoes";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin", "advogado"]);
  const permissoes = (await getPermissoes())!;
  // lista leve para a busca rápida (Ctrl+K): só os clientes que a pessoa pode ver
  const clients = permissoes.clientes ? await listClients().catch(() => []) : [];
  // sininho de publicações: por enquanto só para o admin
  const publicacoesPendentes = profile.role === "admin" ? await contarNaoTratadas().catch(() => 0) : 0;

  return (
    <AdminShell
      userName={profile.full_name}
      userRole={profile.role}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      permissoes={permissoes}
      publicacoesPendentes={publicacoesPendentes}
    >
      {children}
    </AdminShell>
  );
}
