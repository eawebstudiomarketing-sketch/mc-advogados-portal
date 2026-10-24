import { AdminShell } from "@/components/layout/admin-shell";
import { ehSuperAdmin, getPermissoes, requireRole } from "@/lib/dal";
import { listClients } from "@/lib/data/clients";
import { contarNaoTratadas } from "@/lib/data/publicacoes";
import { contarNaoLidas } from "@/lib/data/mensagens";
import { contarDistribuicaoPendentes } from "@/lib/data/distribuicao";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin", "advogado"]);
  const permissoes = (await getPermissoes())!;
  // lista leve para a busca rápida (Ctrl+K): só os clientes que a pessoa pode ver
  const clients = permissoes.clientes ? await listClients().catch(() => []) : [];
  // sininho de publicações: por enquanto só para o admin
  const [publicacoesPendentes, mensagensNaoLidas, distribuicaoPendentes] = await Promise.all([
    profile.role === "admin" ? contarNaoTratadas().catch(() => 0) : 0,
    contarNaoLidas(profile.id).catch(() => 0),
    permissoes.distribuicao ? contarDistribuicaoPendentes().catch(() => 0) : 0,
  ]);

  return (
    <AdminShell
      userName={profile.full_name}
      userRole={profile.role}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      permissoes={permissoes}
      publicacoesPendentes={publicacoesPendentes}
      mensagensNaoLidas={mensagensNaoLidas}
      distribuicaoPendentes={distribuicaoPendentes}
      superAdmin={ehSuperAdmin(profile)}
    >
      {children}
    </AdminShell>
  );
}
