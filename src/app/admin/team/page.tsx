import Link from "next/link";
import { ChevronRight, Crown, UserPlus } from "lucide-react";
import { listStaff } from "@/lib/data/team";
import { ehSuperAdmin, exigirPermissao } from "@/lib/dal";
import { getEscritorioConfig, listPessoas } from "@/lib/data/escritorio";
import { Avatar } from "@/components/ui/avatar";
import { EditorAreas, LinhaPessoa } from "./pessoas-zap";
import { ZapConfig } from "./zap-config";

// Equipe (30/10/2026): a lista de pessoas. Tudo o que é de cada uma — indicadores,
// rotina, demandas, WhatsApp, áreas, clientes, acessos e permissões — fica na
// página dela (/admin/team/[id], só o admin máximo). Aqui ficam também as
// configurações do escritório (lista de áreas e a mensagem das 8h) e quem não
// tem login (só WhatsApp e áreas).

const PAPEL: Record<string, string> = { admin: "Administrador(a)", advogado: "Advogado(a)" };

export default async function AdminTeamPage() {
  const { profile } = await exigirPermissao("equipe");
  const souSuper = ehSuperAdmin(profile);
  const [staff, pessoas, config] = await Promise.all([listStaff(), listPessoas(), getEscritorioConfig()]);
  const fotoDe = new Map(pessoas.filter((p) => p.profileId).map((p) => [p.profileId!, p.foto]));
  const ordenada = [...staff].sort((a, b) => Number(b.super_admin) - Number(a.super_admin) || (a.role === b.role ? a.full_name.localeCompare(b.full_name, "pt-BR") : a.role === "admin" ? -1 : 1));
  const semLogin = pessoas.filter((p) => !p.profileId);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Equipe</h1>
          <p className="text-sm text-muted">
            {staff.length} {staff.length === 1 ? "pessoa com acesso ao painel" : "pessoas com acesso ao painel"}
            {souSuper ? " · clique numa pessoa para ver e configurar tudo dela" : ""}
          </p>
        </div>
        {souSuper && (
          <Link href="/admin/team/new" className="ui-btn">
            <UserPlus className="h-4 w-4" aria-hidden /> Convidar pessoa
          </Link>
        )}
      </div>

      {!souSuper && <p className="mb-6 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">Só o admin máximo abre a página de cada pessoa e muda o que ela vê.</p>}

      <ul className="ui-card divide-y divide-border">
        {ordenada.map((t) => {
          const linha = (
            <>
              <Avatar nome={t.full_name} foto={fotoDe.get(t.id) ?? null} tamanho={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{t.full_name}</p>
                <p className="truncate text-xs text-muted">{t.email}</p>
              </div>
              {t.super_admin ? (
                <span className="inline-flex items-center gap-1.5 rounded bg-gold-soft px-2 py-0.5 text-xs font-semibold text-gold-ink">
                  <Crown className="h-3.5 w-3.5" aria-hidden /> Admin máximo
                </span>
              ) : (
                <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{PAPEL[t.role] ?? t.role}</span>
              )}
              {!t.ativo && <span className="rounded bg-status-danger-bg px-2 py-0.5 text-xs font-semibold text-status-danger">Desativado</span>}
              {souSuper && <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
            </>
          );
          return (
            <li key={t.id}>
              {souSuper ? (
                <Link href={`/admin/team/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hover">
                  {linha}
                </Link>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3">{linha}</div>
              )}
            </li>
          );
        })}
      </ul>

      {souSuper && semLogin.length > 0 && (
        <section className="mt-8 space-y-2">
          <h2 className="section-title">Pessoas sem acesso ao portal</h2>
          <p className="text-sm text-muted">Responsáveis que não entram no sistema: só o WhatsApp (rotina das 8h e lembretes) e as áreas que atendem.</p>
          <ul className="space-y-2">
            {semLogin.map((p) => (
              <LinhaPessoa key={p.id} pessoa={p} areas={config.areas} />
            ))}
          </ul>
        </section>
      )}

      {souSuper && (
        <section className="mt-8 space-y-4">
          <h2 className="section-title">Configurações do escritório</h2>
          <EditorAreas areas={config.areas} />
          <ZapConfig config={config} />
        </section>
      )}
    </div>
  );
}
