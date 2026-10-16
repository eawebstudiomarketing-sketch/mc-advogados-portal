import Link from "next/link";
import { ShieldCheck, UserPlus } from "lucide-react";
import { listDesignacoes, listPermissoesSalvas, listStaff } from "@/lib/data/team";
import { listClients } from "@/lib/data/clients";
import { requireRole } from "@/lib/dal";
import { resolverPermissoes } from "@/lib/permissoes";
import { removeStaffAction } from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { MembroCard } from "./membro-card";
import { PessoasZap } from "./pessoas-zap";
import { ZapConfig } from "./zap-config";
import { DemandasEquipe } from "./demandas-equipe";
import { getEscritorioConfig, listPessoas } from "@/lib/data/escritorio";
import { listActivities } from "@/lib/data/activities";
import { serializarCargas } from "@/lib/data/painel";

const ABAS = [
  ["acessos", "Acessos e permissões"],
  ["pessoas", "Pessoas, áreas e WhatsApp"],
  ["demandas", "Demandas de cada um"],
] as const;
type Aba = (typeof ABAS)[number][0];

// Equipe (só admin): cada advogado com os clientes que cuida (só esses ele
// enxerga) e o que pode ver/fazer no painel.
export default async function AdminTeamPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const currentProfile = await requireRole(["admin"]);
  const { aba: abaParam } = await searchParams;
  const aba: Aba = ABAS.some(([id]) => id === abaParam) ? (abaParam as Aba) : "acessos";

  const abas = (
    <nav aria-label="Seções da equipe" className="mb-6 flex flex-wrap gap-1 border-b border-border">
      {ABAS.map(([id, rotulo]) => (
        <Link
          key={id}
          href={id === "acessos" ? "/admin/team" : `/admin/team?aba=${id}`}
          aria-current={aba === id ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
            aba === id ? "border-navy-3 font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {rotulo}
        </Link>
      ))}
    </nav>
  );

  if (aba === "pessoas") {
    const [pessoas, config] = await Promise.all([listPessoas(), getEscritorioConfig()]);
    return (
      <div>
        <h1 className="page-title mb-1">Equipe</h1>
        <p className="mb-5 text-sm text-muted">WhatsApp de cada pessoa (rotina das 7h) e as áreas que cada um atende.</p>
        {abas}
        <div className="space-y-6">
          <PessoasZap pessoas={pessoas} areas={config.areas} />
          <ZapConfig config={config} />
        </div>
      </div>
    );
  }

  if (aba === "demandas") {
    const [pessoas, atividades] = await Promise.all([listPessoas(), listActivities()]);
    const { cargas, semResponsavel } = serializarCargas(atividades, pessoas);
    return (
      <div>
        <h1 className="page-title mb-1">Equipe</h1>
        <p className="mb-5 text-sm text-muted">Tudo o que está em aberto com cada pessoa, separado por prazo.</p>
        {abas}
        <DemandasEquipe cargas={cargas} semResponsavel={semResponsavel} />
      </div>
    );
  }

  const [staff, clientes, designacoes, salvas] = await Promise.all([listStaff(), listClients(), listDesignacoes(), listPermissoesSalvas()]);
  const admins = staff.filter((p) => p.role === "admin");
  const advogados = staff.filter((p) => p.role === "advogado");
  const listaClientes = clientes.map((c) => ({ id: c.id, name: c.name }));
  const semDono = clientes.filter((c) => !advogados.some((a) => designacoes.get(a.id)?.includes(c.id))).length;

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Equipe</h1>
          <p className="text-sm text-muted">
            {staff.length} {staff.length === 1 ? "pessoa com acesso ao painel" : "pessoas com acesso ao painel"}
            {semDono ? ` · ${semDono} ${semDono === 1 ? "cliente sem advogado (só você vê)" : "clientes sem advogado (só você vê)"}` : ""}
          </p>
        </div>
        <Link href="/admin/team/new" className="ui-btn">
          <UserPlus className="h-4 w-4" aria-hidden /> Convidar pessoa
        </Link>
      </div>

      {abas}

      <h2 className="section-title mb-3">Administradores</h2>
      <div className="mb-8 space-y-2">
        {admins.map((t) => (
          <div key={t.id} className="ui-card flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-gold-2">
              {t.full_name.replace(/^(Dr\.?|Dra\.?)\s+/i, "").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{t.full_name}</p>
              <p className="truncate text-xs text-muted">{t.email}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-navy/[0.06] px-2.5 py-1 text-xs font-medium text-navy-3">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Acesso total
            </span>
            {t.id !== currentProfile.id && (
              <ConfirmSubmitButton
                action={removeStaffAction}
                hiddenFields={{ profile_id: t.id }}
                confirmMessage={`Remover o acesso de ${t.full_name}? Essa ação não pode ser desfeita.`}
                label="Remover acesso"
                icon="user-x"
              />
            )}
          </div>
        ))}
      </div>

      <h2 className="section-title mb-1">Advogados</h2>
      <p className="mb-3 text-xs text-muted">
        Cada advogado só enxerga os clientes designados a ele. Abra &ldquo;Clientes&rdquo; para escolher quais e &ldquo;O que pode ver e fazer&rdquo; para liberar ou bloquear telas e ações.
      </p>
      <div className="space-y-3">
        {advogados.length === 0 && (
          <p className="ui-card p-6 text-sm text-muted">
            Nenhum advogado ainda.{" "}
            <Link href="/admin/team/new" className="ui-link">
              Convidar o primeiro
            </Link>
          </p>
        )}
        {advogados.map((t) => (
          <MembroCard
            key={t.id}
            membro={{ id: t.id, nome: t.full_name, email: t.email, ativo: t.ativo }}
            clientes={listaClientes}
            designados={designacoes.get(t.id) ?? []}
            permissoes={resolverPermissoes("advogado", salvas.get(t.id))}
            acoes={
              <ConfirmSubmitButton
                action={removeStaffAction}
                hiddenFields={{ profile_id: t.id }}
                confirmMessage={`Remover de vez o acesso de ${t.full_name}? O login é apagado (prefira desativar).`}
                label="Remover de vez"
                icon="user-x"
              />
            }
          />
        ))}
      </div>
    </div>
  );
}
