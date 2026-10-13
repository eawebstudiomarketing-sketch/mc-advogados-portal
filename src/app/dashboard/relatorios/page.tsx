import Link from "next/link";
import { CheckCircle2, Clock3, CircleDashed, Download, FileBarChart2 } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listReports } from "@/lib/data/reports";
import { atividadesDoPeriodo } from "@/lib/relatorio";
import { MESES } from "@/lib/relatorio-datas";
import { PERIODOS, resolverPeriodo } from "@/lib/periodo-cliente";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { EmptyState } from "@/components/ui/empty-state";
import type { Activity } from "@/lib/data/activities";

const dataBR = (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("pt-BR");

function Bloco({
  titulo,
  icone: Icone,
  cor,
  itens,
  vazio,
  meta,
}: {
  titulo: string;
  icone: typeof CheckCircle2;
  cor: string;
  itens: Activity[];
  vazio: string;
  meta: (a: Activity) => string;
}) {
  return (
    <section className="ui-card p-5">
      <h2 className="section-title flex items-center gap-2">
        <Icone className={`h-4 w-4 ${cor}`} aria-hidden /> {titulo}
        <span className="ml-auto rounded-full bg-surface-2 px-2 text-xs font-medium tabular-nums text-muted">{itens.length}</span>
      </h2>
      {itens.length === 0 ? (
        <p className="py-4 text-sm text-muted">{vazio}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {itens.map((a) => (
            <li key={a.id} className="py-2.5">
              <p className="text-sm font-medium text-foreground">{a.title}</p>
              <p className="text-xs text-muted">{meta(a)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Relatórios prontos para o cliente: semana e mês, gerados na hora a partir
// das atividades dele, mais os relatórios mensais em PDF enviados pelo escritório.
export default async function ClientReportsPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const profile = await requireRole(["client"]);
  const clientId = profile.client_id!;
  const p = resolverPeriodo((await searchParams).periodo);

  const supabase = await createClient();
  const [ativ, enviados] = await Promise.all([atividadesDoPeriodo(supabase, clientId, p.inicio, p.fim), listReports({ clientId })]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Relatório de atividades</p>
          <h1 className="page-title mt-0.5">{p.rotulo}</h1>
        </div>
        <a href={`/api/cliente/relatorio?periodo=${p.id}`} target="_blank" rel="noreferrer" className="ui-btn">
          <Download className="h-4 w-4 text-gold-2" aria-hidden /> Baixar PDF
        </a>
      </div>

      <nav aria-label="Período" className="mb-6 inline-flex flex-wrap gap-0.5 rounded-xl bg-[#eceef2] p-1">
        {PERIODOS.map((x) => (
          <Link
            key={x.id}
            href={`/dashboard/relatorios?periodo=${x.id}`}
            aria-current={x.id === p.id ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-[background-color,color,box-shadow] duration-150 ${
              x.id === p.id ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { n: ativ.concluidas.length, l: `Concluídas ${p.sufixo}`, c: "text-status-success" },
          { n: ativ.emAndamento.length, l: "Em andamento", c: "text-status-info" },
          { n: ativ.aFazer.length, l: "A fazer", c: "text-status-pending" },
        ].map((x) => (
          <div key={x.l} className="ui-card p-4">
            <p className="text-[13px] font-medium text-muted">{x.l}</p>
            <p className={`mt-1.5 text-[1.75rem] leading-none font-semibold tabular-nums ${x.c}`}>{x.n}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Bloco
          titulo={`Concluídas ${p.sufixo}`}
          icone={CheckCircle2}
          cor="text-status-success"
          itens={ativ.concluidas}
          vazio="Nenhuma atividade concluída neste período."
          meta={(a) => `${ACTIVITY_TYPE_LABEL[a.type]} · concluída em ${dataBR(a.updated_at)}`}
        />
        <Bloco
          titulo="Em andamento"
          icone={Clock3}
          cor="text-status-info"
          itens={ativ.emAndamento}
          vazio="Nada em andamento agora."
          meta={(a) => (a.deadline ? `Prazo ${dataBR(a.deadline)}` : ACTIVITY_TYPE_LABEL[a.type])}
        />
        <Bloco
          titulo="A fazer"
          icone={CircleDashed}
          cor="text-status-pending"
          itens={ativ.aFazer}
          vazio="Nada pendente."
          meta={(a) => (a.deadline ? `Prazo ${dataBR(a.deadline)}` : ACTIVITY_TYPE_LABEL[a.type])}
        />
      </div>

      <section className="ui-card mt-6 p-5">
        <h2 className="section-title">Relatórios mensais enviados pelo escritório</h2>
        {enviados.length === 0 ? (
          <EmptyState icon={FileBarChart2} title="Nenhum relatório mensal ainda" compact />
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {enviados.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-gold-2">
                  <FileBarChart2 className="h-4 w-4" aria-hidden />
                </span>
                <p className="flex-1 text-sm font-medium text-foreground">
                  {MESES[r.reference_month]} de {r.reference_year}
                </p>
                {r.downloadUrl && (
                  <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Baixar PDF" data-tip="Baixar PDF">
                    <Download aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
