import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, CircleDashed, Gavel, FolderUp, FileText, Download, FileBarChart2 } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listProcesses } from "@/lib/data/processes";
import { listDocuments } from "@/lib/data/documents";
import { atividadesDoPeriodo } from "@/lib/relatorio";
import { intervaloDoMes, MESES } from "@/lib/relatorio-datas";
import { pedidosDoCliente } from "@/lib/pedidos-documentos";
import { ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import type { Activity } from "@/lib/data/activities";

const dataBR = (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

function Lista({ itens, vazio, meta }: { itens: Activity[]; vazio: string; meta: (a: Activity) => string }) {
  if (!itens.length) return <p className="py-3 text-sm text-muted">{vazio}</p>;
  return (
    <ul className="divide-y divide-border">
      {itens.slice(0, 6).map((a) => (
        <li key={a.id} className="py-3">
          <p className="text-[15px] font-medium leading-snug text-foreground sm:text-sm">{a.title}</p>
          <p className="mt-0.5 text-xs text-muted">{meta(a)}</p>
        </li>
      ))}
    </ul>
  );
}

// Início do portal do cliente: o que o escritório está fazendo no mês.
// Sem horas e sem financeiro (decisão do usuário, 08/10/2026).
export default async function DashboardPage() {
  const profile = await requireRole(["client"]);
  const clientId = profile.client_id!;
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const [ano, mes] = hoje.split("-").map(Number);
  const { inicio, fim } = intervaloDoMes(ano, mes);

  const supabase = await createClient();
  const [ativ, processos, documentos, pedidos] = await Promise.all([
    atividadesDoPeriodo(supabase, clientId, inicio, fim),
    listProcesses({ clientId }),
    listDocuments({ clientId }),
    pedidosDoCliente(clientId),
  ]);
  const pendentes = pedidos.filter((p) => !p.enviado);
  const primeiroNome = profile.full_name.split(" ")[0];

  const numeros = [
    { n: ativ.concluidas.length, l: "Concluídas no mês", icone: CheckCircle2, cor: "text-status-success", bg: "bg-status-success-bg" },
    { n: ativ.emAndamento.length, l: "Em andamento", icone: Clock3, cor: "text-status-info", bg: "bg-status-info-bg" },
    { n: ativ.aFazer.length, l: "A fazer", icone: CircleDashed, cor: "text-status-pending", bg: "bg-status-pending-bg" },
    { n: processos.length, l: "Processos", icone: Gavel, cor: "text-navy-3", bg: "bg-navy/[0.07]", href: "/dashboard/processos" },
  ];

  return (
    <>
      <div className="mb-6">
        <p className="text-sm text-muted">
          {MESES[mes]} de {ano}
        </p>
        <h1 className="page-title mt-0.5">Olá, {primeiroNome}</h1>
        <p className="mt-1 text-sm text-muted">Veja o que o escritório está fazendo por você este mês.</p>
      </div>

      {pendentes.length > 0 && (
        <Link
          href="/dashboard/documentos"
          className="mb-5 flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold-soft px-4 py-3 transition-colors hover:border-gold"
        >
          <FolderUp className="h-5 w-5 shrink-0 text-gold-ink" aria-hidden />
          <p className="flex-1 text-sm text-gold-ink">
            <span className="font-semibold">Aguardando {pendentes.length} documento(s) seu(s):</span> {pendentes.slice(0, 3).map((p) => p.item).join(", ")}
            {pendentes.length > 3 ? "…" : ""}
          </p>
          <ArrowRight className="h-4 w-4 shrink-0 text-gold-ink" aria-hidden />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {numeros.map((x) => {
          const corpo = (
            <>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${x.bg} ${x.cor}`}>
                <x.icone className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <p className={`mt-3 text-[1.75rem] leading-none font-semibold tabular-nums ${x.cor}`}>{x.n}</p>
              <p className="mt-1 text-[13px] text-muted">{x.l}</p>
            </>
          );
          return x.href ? (
            <Link key={x.l} href={x.href} className="ui-card p-4 transition-shadow hover:shadow-md">
              {corpo}
            </Link>
          ) : (
            <Link key={x.l} href="/dashboard/activities" className="ui-card p-4 transition-shadow hover:shadow-md">
              {corpo}
            </Link>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="ui-card p-5">
          <h2 className="section-title flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-status-info" aria-hidden /> Em andamento agora
          </h2>
          <Lista
            itens={ativ.emAndamento}
            vazio="Nada em andamento neste momento."
            meta={(a) => `${ACTIVITY_TYPE_LABEL[a.type]}${a.deadline ? ` · prazo ${dataBR(a.deadline)}` : ""}`}
          />
        </section>
        <section className="ui-card p-5">
          <h2 className="section-title flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden /> Concluídas este mês
          </h2>
          <Lista
            itens={ativ.concluidas}
            vazio="Nenhuma atividade concluída ainda este mês."
            meta={(a) => `${ACTIVITY_TYPE_LABEL[a.type]} · concluída em ${dataBR(a.updated_at)}`}
          />
        </section>
        <section className="ui-card p-5">
          <h2 className="section-title flex items-center gap-2">
            <CircleDashed className="h-4 w-4 text-status-pending" aria-hidden /> Próximos passos
          </h2>
          <Lista
            itens={ativ.aFazer}
            vazio="Nenhuma atividade programada."
            meta={(a) => `${ACTIVITY_TYPE_LABEL[a.type]}${a.deadline ? ` · prazo ${dataBR(a.deadline)}` : ""}`}
          />
        </section>
        <section className="ui-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <FileText className="h-4 w-4 text-navy-3" aria-hidden /> Documentos recentes
            </h2>
            <Link href="/dashboard/documentos" className="ui-link">
              Todos
            </Link>
          </div>
          {documentos.length === 0 ? (
            <p className="py-3 text-sm text-muted">Nenhum documento ainda.</p>
          ) : (
            <ul className="divide-y divide-border">
              {documentos.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-foreground sm:text-sm">{d.title}</p>
                    <p className="text-xs text-muted">{dataBR(d.created_at)}</p>
                  </div>
                  {d.downloadUrl && (
                    <a href={d.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn h-10 w-10" aria-label="Baixar" data-tip="Baixar">
                      <Download aria-hidden />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Link
        href="/dashboard/relatorios"
        className="mt-5 flex items-center gap-4 rounded-2xl bg-navy-2 p-5 text-white transition-opacity hover:opacity-95"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <FileBarChart2 className="h-5 w-5 text-gold-2" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Relatório da semana e do mês</p>
          <p className="text-sm text-white/60">Tudo o que foi feito, em andamento e a fazer. Dá para baixar em PDF.</p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-gold-2" aria-hidden />
      </Link>
    </>
  );
}
