import { AdminShell } from "@/components/layout/admin-shell";
import { ehSuperAdmin, getPermissoes, requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

async function clientesParaBusca(): Promise<{ id: string; name: string }[]> {
  const { data } = await (await createClient()).from("clients").select("id, name").is("archived_at", null).order("name");
  return data ?? [];
}
import { contarNaoTratadas } from "@/lib/data/publicacoes";
import { contarNaoLidas } from "@/lib/data/mensagens";
import { contarDistribuicaoPendentes } from "@/lib/data/distribuicao";
import { alertaDaRotina } from "@/lib/rotina-relatorio/alerta";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["admin", "advogado"]);
  const permissoes = (await getPermissoes())!;
  // tudo em paralelo (desempenho, 30/10): lista leve para a busca rápida (Ctrl+K, só id e nome dos
  // clientes que a pessoa pode ver), sininho de publicações (só admin), mensagens, distribuição e o relógio da rotina
  const [clients, publicacoesPendentes, mensagensNaoLidas, distribuicaoPendentes, alertaRotina] = await Promise.all([
    permissoes.clientes ? clientesParaBusca().catch(() => []) : Promise.resolve([] as { id: string; name: string }[]),
    profile.role === "admin" ? contarNaoTratadas().catch(() => 0) : 0,
    contarNaoLidas(profile.id).catch(() => 0),
    permissoes.distribuicao ? contarDistribuicaoPendentes().catch(() => 0) : 0,
    alertaDaRotina(profile.id).catch(() => null),
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
      alertaRotina={alertaRotina}
      superAdmin={ehSuperAdmin(profile)}
    >
      {children}
    </AdminShell>
  );
}
