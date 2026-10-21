import Link from "next/link";
import { BellRing, CheckCheck, Inbox, Star } from "lucide-react";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { StatCard } from "@/components/ui/stat-card";
import { exigirPermissao } from "@/lib/dal";
import { contadoresAndamentos, listAndamentosAgrupados, ROTULO_SITUACAO } from "@/lib/data/andamentos";
import { GrupoCard } from "./grupo-card";
import { LerAgora } from "./ler-agora";

type Busca = { situacao?: string; q?: string; p?: string };
const FILTROS = ["novo", "tratado", "descartado"] as const;

export default async function AndamentosPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { profile } = await exigirPermissao("processos");
  const sp = await searchParams;
  const situacao = (FILTROS as readonly string[]).includes(sp.situacao ?? "") ? (sp.situacao as (typeof FILTROS)[number]) : "novo";
  const [contadores, grupos] = await Promise.all([contadoresAndamentos(), listAndamentosAgrupados({ situacao, processId: sp.p, busca: sp.q })]);
  const ultima = contadores.ultima;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Operacional · Processos</p>
          <h1 className="page-title">Andamentos</h1>
          <p className="text-sm text-muted">
            Movimentações dos processos, lidas de hora em hora (07h às 22h).
            {ultima && (
              <>
                {" "}
                Última leitura:{" "}
                {new Date(ultima.iniciado_em).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" })}
                {ultima.erro ? <span className="text-status-danger"> (erro: {ultima.erro})</span> : null}.
              </>
            )}
          </p>
        </div>
        {profile.role === "admin" && <LerAgora />}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Não tratados" value={String(contadores.novos)} tone={contadores.novos ? "pending" : "default"} icon={Inbox} href="/admin/andamentos" />
        <StatCard label="Importantes" value={String(contadores.importantes)} tone={contadores.importantes ? "pending" : "default"} icon={Star} />
        <StatCard label="Recebidos hoje" value={String(contadores.hoje)} tone="info" icon={BellRing} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f}
            href={f === "novo" ? "/admin/andamentos" : `/admin/andamentos?situacao=${f}`}
            className={`inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium transition-colors ${situacao === f ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/75 hover:border-border-strong hover:text-foreground"}`}
          >
            {ROTULO_SITUACAO[f]}
          </Link>
        ))}
        {sp.p && (
          <Link href="/admin/andamentos" className="ui-link ml-2 text-sm">
            ver todos os processos
          </Link>
        )}
      </div>
      <BarraFiltros filtros={[{ tipo: "busca", nome: "q", rotulo: "Nº do processo, parte, cliente ou texto" }]} />

      <div className="space-y-3">
        {grupos.length === 0 && (
          <div className="ui-card px-5 py-12 text-center text-sm text-muted">
            {situacao === "novo" ? (
              <>
                Nenhum andamento esperando tratamento. <CheckCheck className="inline h-4 w-4 text-status-success" aria-hidden />
              </>
            ) : (
              "Nada aqui nos últimos 30 dias."
            )}
          </div>
        )}
        {grupos.map((g) => (
          <GrupoCard key={g.processo.id} g={g} situacao={situacao} />
        ))}
      </div>
    </div>
  );
}
