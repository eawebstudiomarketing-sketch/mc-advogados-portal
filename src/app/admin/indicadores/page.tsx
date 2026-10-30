import Link from "next/link";
import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Sparkles } from "lucide-react";
import { ehSuperAdmin, requireRole } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERIODOS, periodoDe } from "@/lib/painel/base";
import { indicadoresDe, type Indicadores } from "@/lib/painel/individual";
import { resumoDaPessoa } from "@/lib/painel/individual-ia";
import { LinhaCriadasConcluidas } from "@/components/painel/graficos";
import { KpiCard } from "@/components/painel/graficos2";

export const metadata = { title: "Indicadores" };

const num = (n: number | null, c = 1) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: c }));
const dataBr = (d: string) => d.split("-").reverse().join("/");
const horas = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : `${num(h)} h`);
const dif = (atual: number, ant: number) => (ant === 0 && atual === 0 ? undefined : `${atual >= ant ? "+" : ""}${atual - ant} em relação ao período anterior`);

// Indicadores: o retrato do Painel do Dono, mas só da própria pessoa — atividades
// designadas a ela, entregas, tempos, WhatsApp, processos, publicações e
// andamentos — mais o resumo com IA dela. Ninguém vê os dados de outra pessoa;
// só o admin máximo (Maurício e João) escolhe de quem olhar (?pessoa=).
export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<{ p?: string; pessoa?: string }> }) {
  const perfil = await requireRole(["admin", "advogado"]);
  const sp = await searchParams;
  const super_ = ehSuperAdmin(perfil);
  const periodo = periodoDe(sp.p);

  const db = createAdminClient() as unknown as SupabaseClient;
  const { data: equipe } = super_
    ? await db.from("profiles").select("id, full_name").in("role", ["admin", "advogado"]).eq("ativo", true).eq("oculto", false).order("full_name")
    : { data: null };
  // só o admin máximo olha outra pessoa; para todo o resto vale sempre o próprio login
  const alvoId = super_ && sp.pessoa && (equipe ?? []).some((x) => x.id === sp.pessoa) ? sp.pessoa : perfil.id;
  const ind = await indicadoresDe(alvoId, periodo.id);
  const meu = alvoId === perfil.id;

  const link = (q: { p?: string; pessoa?: string }) => {
    const u = new URLSearchParams();
    const pp = q.p ?? periodo.id;
    const ps = q.pessoa === undefined ? (meu ? "" : alvoId) : q.pessoa;
    if (pp !== "mes") u.set("p", pp);
    if (ps) u.set("pessoa", ps);
    const s = u.toString();
    return `/admin/indicadores${s ? `?${s}` : ""}`;
  };

  return (
    <div className="pb-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Gestão · Indicadores</p>
          <h1 className="page-title">{meu ? "Meus indicadores" : `Indicadores de ${ind?.pessoa.nome ?? "—"}`}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {meu ? "Só você vê estes números: o que foi designado a você, o que entregou, tempos, WhatsApp, processos, publicações e andamentos." : "Você está vendo os indicadores de outra pessoa (só o admin máximo pode)."}
          </p>
        </div>
        <div className="inline-flex flex-wrap rounded-full border border-border bg-surface p-0.5 text-xs" role="tablist" aria-label="Período">
          {PERIODOS.map((x) => (
            <Link key={x.id} href={link({ p: x.id })} role="tab" aria-selected={periodo.id === x.id} className={`rounded-full px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${periodo.id === x.id ? "bg-navy text-white" : "text-foreground/60 hover:text-foreground"}`}>
              {x.rotulo}
            </Link>
          ))}
        </div>
      </div>

      {super_ && (equipe?.length ?? 0) > 0 && (
        <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Pessoa">
          <span className="mr-1 text-xs text-muted">Ver de:</span>
          {(equipe ?? []).map((x) => (
            <Link key={x.id} href={link({ pessoa: x.id === perfil.id ? "" : x.id })} aria-current={x.id === alvoId ? "page" : undefined} className={`rounded-full border px-3 py-1 ${x.id === alvoId ? "border-navy bg-navy text-white" : "border-border text-foreground/70 hover:text-foreground"}`}>
              {x.id === perfil.id ? "Eu" : x.full_name.split(" ").slice(0, 2).join(" ")}
            </Link>
          ))}
          <Link href="/admin/painel" className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            Painel do Dono (escritório inteiro) <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </nav>
      )}

      {!ind ? (
        <div className="ui-card p-6 text-sm text-muted">Não encontrei essa pessoa.</div>
      ) : (
        <div className="space-y-6">
          <Suspense fallback={<CartaoIa carregando />}>
            <ResumoIa ind={ind} />
          </Suspense>

          <section aria-label="Atividades" className="space-y-3">
            <h2 className="section-title">Atividades designadas a {meu ? "você" : ind.pessoa.nome.split(" ")[0]}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard rotulo="Nota" valor={ind.nota === null ? "—" : String(ind.nota)} apoio={ind.nota === null ? "sem atividades para avaliar" : "de 0 a 100"} />
              <KpiCard rotulo="Nota das rotinas" valor={ind.rotina.media === null ? "—" : String(ind.rotina.media).replace(".", ",")} apoio={ind.rotina.media === null ? "nenhum relatório aprovado no período" : `de 10 · ${ind.rotina.relatorios} ${ind.rotina.relatorios === 1 ? "relatório aprovado" : "relatórios aprovados"}`} />
              <KpiCard rotulo="Designadas" valor={String(ind.atividades.designadas)} apoio={dif(ind.atividades.designadas, ind.atividades.designadasAnt)} />
              <KpiCard rotulo="Entregues" valor={String(ind.atividades.entregues)} apoio={dif(ind.atividades.entregues, ind.atividades.entreguesAnt)} tom="success" />
              <KpiCard rotulo="No prazo" valor={ind.atividades.noPrazoPct === null ? "—" : `${ind.atividades.noPrazoPct}%`} apoio="das entregues do período" />
              <KpiCard rotulo="Tempo até concluir" valor={ind.atividades.tempoMedianoDias === null ? "—" : `${num(ind.atividades.tempoMedianoDias)} d`} apoio={ind.atividades.tempoMedioDias === null ? undefined : `média ${num(ind.atividades.tempoMedioDias)} d (do pedido à entrega)`} />
              <KpiCard rotulo="Abertas agora" valor={String(ind.atividades.abertas)} apoio={`carga ${num(ind.atividades.carga)}`} />
              <KpiCard rotulo="Atrasadas agora" valor={String(ind.atividades.atrasadas)} tom={ind.atividades.atrasadas > 0 ? "danger" : undefined} />
              <KpiCard rotulo="Resposta no WhatsApp" valor={horas(ind.whatsapp.medianaHoras)} apoio={ind.whatsapp.respondidas ? `mediana · ${ind.whatsapp.respondidas} conversas respondidas` : "sem conversas respondidas no período"} />
            </div>
            <div className="ui-card p-5">
              <p className="text-sm font-semibold text-foreground">Designadas × entregues</p>
              <p className="mb-2 text-xs text-muted">{periodo.rotulo}</p>
              <LinhaCriadasConcluidas serie={ind.atividades.serie} rotulos={["Designadas", "Entregues"]} />
            </div>
          </section>

          <section aria-label="Processos, publicações e andamentos" className="space-y-3">
            <h2 className="section-title">Processos, publicações e andamentos</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard rotulo="Processos ativos" valor={String(ind.processos.sob)} apoio="como responsável" />
              <KpiCard rotulo="Andamentos novos" valor={String(ind.processos.andamentosNovos)} apoio="sem tratar, nos processos sob responsabilidade" tom={ind.processos.andamentosNovos > 0 ? "pending" : undefined} />
              <KpiCard rotulo="Andamentos tratados" valor={String(ind.processos.andamentosTratados)} apoio={`${meu ? "por você" : "pela pessoa"} no período`} />
              <KpiCard rotulo="Andamentos no período" valor={String(ind.processos.andamentosNoPeriodo)} apoio="nos processos sob responsabilidade" />
              <KpiCard rotulo="Publicações pendentes" valor={String(ind.processos.publicacoesPendentes)} apoio="nos processos sob responsabilidade" tom={ind.processos.publicacoesPendentes > 0 ? "pending" : undefined} />
              <KpiCard rotulo="Publicações tratadas" valor={String(ind.processos.publicacoesTratadas)} apoio="no período" />
              <KpiCard rotulo="Tempo p/ tratar publicação" valor={horas(ind.processos.tempoTratarPublicacaoHoras)} apoio="mediana" />
              <KpiCard rotulo="Mensagens no WhatsApp" valor={String(ind.whatsapp.respostas)} apoio="respostas enviadas no período" />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Lista titulo="Atrasadas" vazio="Nada atrasado. 👏" itens={ind.atividades.atrasadasLista.map((x) => ({ id: x.id, titulo: x.titulo, apoio: `${x.cliente ?? "Sem cliente"} · prazo ${dataBr(x.prazo)} · ${x.diasAtraso} d de atraso` }))} />
            <Lista titulo="Abertas há mais tempo" vazio="Nenhuma atividade aberta." itens={ind.atividades.maisAntigas.map((x) => ({ id: x.id, titulo: x.titulo, apoio: `${x.cliente ?? "Sem cliente"} · aberta há ${x.dias} d` }))} />
            <Lista titulo="Entregues recentemente" vazio="Nenhuma entrega no período." itens={ind.atividades.entreguesLista.map((x) => ({ id: x.id, titulo: x.titulo, apoio: `${x.cliente ?? "Sem cliente"} · ${num(x.dias)} d do pedido à entrega` }))} />
          </div>

          <section aria-label="Trabalho no sistema" className="space-y-3">
            <h2 className="section-title">No sistema</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <KpiCard rotulo="Horas lançadas" valor={num(ind.trabalho.horas)} />
              <KpiCard rotulo="Comentários" valor={String(ind.trabalho.comentarios)} />
              <KpiCard rotulo="Reuniões gravadas" valor={String(ind.trabalho.atas)} />
              <KpiCard rotulo="Transcrições" valor={String(ind.trabalho.transcricoes)} />
              <KpiCard rotulo="Ações registradas" valor={String(ind.trabalho.acoes)} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Lista({ titulo, itens, vazio }: { titulo: string; itens: { id: string; titulo: string; apoio: string }[]; vazio: string }) {
  return (
    <section className="ui-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      {itens.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{vazio}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {itens.map((x) => (
            <li key={x.id} className="py-2">
              <Link href={`/admin/activities/${x.id}`} className="block text-sm font-medium text-foreground hover:underline">
                {x.titulo}
              </Link>
              <p className="text-xs text-muted">{x.apoio}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CartaoIa({ carregando, erro, resumo }: { carregando?: boolean; erro?: string; resumo?: { paragrafos: string[]; recomendacoes: string[]; geradoEm: string; periodo: string } }) {
  return (
    <section className="ui-card p-5" aria-label="Resumo com IA">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Sparkles className="h-4 w-4 text-gold" aria-hidden /> Resumo com IA
      </h2>
      {carregando ? (
        <p className="mt-3 text-sm text-muted">Montando o resumo do período…</p>
      ) : erro ? (
        <p className="mt-3 text-sm text-muted">{erro}</p>
      ) : resumo ? (
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground">
          {resumo.paragrafos.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
          {resumo.recomendacoes.length > 0 && (
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="mb-1.5 font-semibold">Recomendo</p>
              <ul className="list-disc space-y-1 pl-5">
                {resumo.recomendacoes.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted">
            {resumo.periodo} · atualizado em {new Date(resumo.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      ) : null}
    </section>
  );
}

async function ResumoIa({ ind }: { ind: Indicadores }) {
  const r = await resumoDaPessoa(ind);
  return r.ok ? <CartaoIa resumo={r.resumo} /> : <CartaoIa erro={r.error} />;
}
