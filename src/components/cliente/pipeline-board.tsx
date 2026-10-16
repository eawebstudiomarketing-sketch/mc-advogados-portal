import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ETAPAS, type CartaoPipeline, type EtapaId } from "@/lib/data/pipeline";

// Quadro do pipeline do cliente (colunas = etapas da operação). Cada cartão
// leva ao próximo passo daquele cliente.

const PROXIMO: Record<EtapaId, { rotulo: string; href: (id: string) => string }> = {
  ficha_incompleta: { rotulo: "Completar ficha", href: (id) => `/admin/clients/${id}/handoff` },
  ficha_completa: { rotulo: "Gerar onboarding", href: (id) => `/admin/onboarding/new?clientId=${id}` },
  onboarding_gerado: { rotulo: "Ver onboarding", href: (id) => `/admin/clients/${id}?aba=onboarding` },
  onboarding_respondido: { rotulo: "Gerar demandas", href: (id) => `/admin/clients/${id}?aba=demandas` },
  demandas_geradas: { rotulo: "Aprovar demandas", href: (id) => `/admin/clients/${id}?aba=demandas` },
  em_execucao: { rotulo: "Ver atividades", href: (id) => `/admin/clients/${id}?aba=atividades` },
};

const COR: Record<EtapaId, string> = {
  ficha_incompleta: "bg-status-danger",
  ficha_completa: "bg-status-pending",
  onboarding_gerado: "bg-gold",
  onboarding_respondido: "bg-status-info",
  demandas_geradas: "bg-[#7c5cc4]",
  em_execucao: "bg-status-success",
};

const ha = (iso: string | null) => {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return dias <= 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
};

export function PipelineBoard({ cartoes, compacto = false }: { cartoes: CartaoPipeline[]; compacto?: boolean }) {
  if (compacto) {
    // faixa da Visão geral: quantos clientes em cada etapa
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ETAPAS.map((e) => {
          const n = cartoes.filter((c) => c.etapa === e.id).length;
          return (
            <Link key={e.id} href={`/admin/clients?ver=pipeline#${e.id}`} title={e.dica} className="ui-card group px-3 py-2.5 transition-colors hover:border-border-strong">
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className={`h-2 w-2 rounded-full ${COR[e.id]}`} aria-hidden /> {e.rotulo}
              </span>
              <span className="text-xl font-semibold text-foreground tabular-nums">{n}</span>
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {ETAPAS.map((e) => {
        const lista = cartoes.filter((c) => c.etapa === e.id);
        return (
          <section key={e.id} id={e.id} className="flex w-64 shrink-0 flex-col rounded-2xl bg-surface-2/70 p-2">
            <header className="mb-2 px-1.5 pt-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <span className={`h-2 w-2 rounded-full ${COR[e.id]}`} aria-hidden /> {e.rotulo}
                <span className="ml-auto rounded-full bg-surface px-1.5 text-[11px] text-muted tabular-nums">{lista.length}</span>
              </p>
              <p className="text-[11px] text-muted">{e.dica}</p>
            </header>
            <ul className="space-y-2">
              {lista.map((c) => (
                <li key={c.id} className="ui-card p-3">
                  <Link href={`/admin/clients/${c.id}`} className="block text-sm font-medium text-foreground hover:underline">
                    {c.nome}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {e.id === "ficha_incompleta" ? `Ficha ${c.fichaPct}% preenchida` : c.abertas ? `${c.abertas} em aberto` : "Sem atividades em aberto"}
                    {c.atrasadas ? ` · ${c.atrasadas} atrasada(s)` : ""}
                    {c.rascunhos && e.id === "demandas_geradas" ? ` · ${c.rascunhos} rascunho(s)` : ""}
                    {ha(c.desde) ? ` · ${ha(c.desde)}` : ""}
                  </p>
                  <Link href={PROXIMO[e.id].href(c.id)} className="ui-link mt-2 text-xs">
                    {PROXIMO[e.id].rotulo} <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </li>
              ))}
              {lista.length === 0 && <li className="px-1.5 py-3 text-center text-xs text-muted">Nenhum cliente</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
