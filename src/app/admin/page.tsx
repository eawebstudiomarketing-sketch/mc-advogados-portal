import Link from "next/link";
import { AlertTriangle, ArrowRight, Inbox, Trophy, Building2, Sun, CalendarPlus } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { listActivities, type Activity } from "@/lib/data/activities";
import { listFinancialRecords } from "@/lib/data/financial";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { listPessoas } from "@/lib/data/escritorio";
import { contarDistribuicaoPendentes } from "@/lib/data/distribuicao";
import { contarNaoTratadas } from "@/lib/data/publicacoes";
import { ranking, clientesComMaisPendencias, hojeBahia, emAberto, somaDias } from "@/lib/data/painel";
import { pipelineDosClientes } from "@/lib/data/pipeline";
import { PipelineBoard } from "@/components/cliente/pipeline-board";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import { formatCurrency } from "@/lib/mock-data";
import { QuadroInicial } from "./quadro-inicial";

function saudacao() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const CONCLUIDAS_DIAS = 14;
const ROTULO_CAT: Record<string, string> = { prazo: "Prazo", audiencia: "Audiência", tarefa: "Tarefa" };
const ROTULO_TIPO: Record<string, string> = { reuniao: "Reunião", ligacao: "Ligação", evento: "Evento", outro: "Compromisso" };
const horaBahia = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });

// Visão geral: o dia do escritório numa tela só. Números da pessoa, agenda de
// hoje, ranking da equipe, clientes com mais pendências, pipeline dos
// clientes e o quadro das atividades.
export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { profile, permissoes } = await exigirPermissao("visao_geral");
  const isAdmin = profile.role === "admin";
  const verEquipe = isAdmin || permissoes.ver_equipe;
  const periodo = (await searchParams).periodo === "30" ? 30 : 7;
  const hoje = hojeBahia();

  const supabase = await createClient();
  const [activities, financeiro, meuResponsavel, pessoas, pipeline, pendentesDistribuicao, publicacoesPendentes, { data: compsHoje }] = await Promise.all([
    listActivities(),
    isAdmin ? listFinancialRecords() : Promise.resolve(null),
    responsavelDoPerfil(profile.id),
    listPessoas(),
    permissoes.clientes ? pipelineDosClientes() : Promise.resolve([]),
    permissoes.distribuicao ? contarDistribuicaoPendentes().catch(() => 0) : Promise.resolve(0),
    isAdmin ? contarNaoTratadas().catch(() => 0) : Promise.resolve(0),
    supabase
      .from("compromissos")
      .select("id, titulo, tipo, inicio, participantes, clients(name)")
      .gte("inicio", new Date(`${hoje}T00:00:00-03:00`).toISOString())
      .lt("inicio", new Date(`${somaDias(hoje, 1)}T00:00:00-03:00`).toISOString())
      .order("inicio"),
  ]);

  const corte = Date.parse(hoje) - CONCLUIDAS_DIAS * 86_400_000;
  const noQuadro = activities.filter((a) => emAberto(a) || (a.status === "concluida" && Date.parse(a.updated_at) >= corte));
  const ehMinha = (a: Activity) =>
    (meuResponsavel ? a.responsavel_id === meuResponsavel : false) || (!a.responsavel_id && a.responsible_id === profile.id);
  const minhas = noQuadro.filter(ehMinha);
  const abertasMinhas = minhas.filter(emAberto);
  const atrasadas = abertasMinhas.filter((a) => a.deadline && a.deadline < hoje);
  const deHoje = abertasMinhas.filter((a) => a.deadline === hoje);
  const daSemana = abertasMinhas.filter((a) => a.deadline && a.deadline > hoje && a.deadline <= somaDias(hoje, 7));
  const inadimplentes = financeiro?.filter((f) => f.status === "overdue") ?? [];

  // agenda de hoje: do escritório (quem vê a equipe) ou só a da pessoa
  const nomeResp = new Map(pessoas.map((p) => [p.id, p.nome]));
  const ativsHoje = activities.filter((a) => emAberto(a) && a.deadline === hoje && (verEquipe || ehMinha(a)));
  const comps = (compsHoje ?? []).filter((c) => verEquipe || (meuResponsavel && c.participantes.includes(meuResponsavel)));
  const agendaHoje = [
    ...comps.map((c) => ({
      chave: `c-${c.id}`,
      href: `/admin/agenda/compromisso/${c.id}`,
      hora: horaBahia(c.inicio),
      rotulo: ROTULO_TIPO[c.tipo] ?? "Compromisso",
      titulo: c.titulo,
      cliente: (c.clients as unknown as { name: string } | null)?.name ?? null,
      quem: c.participantes.map((p) => nomeResp.get(p)?.split(" ")[0]).filter(Boolean).join(", "),
      cor: "bg-[#7c5cc4]",
    })),
    ...ativsHoje.map((a) => ({
      chave: `a-${a.id}`,
      href: `/admin/activities/${a.id}`,
      hora: a.hora ? a.hora.slice(0, 5) : "",
      rotulo: ROTULO_CAT[a.categoria] ?? "Tarefa",
      titulo: a.title,
      cliente: a.clients?.name ?? null,
      quem: a.responsaveis?.nome?.split(" ")[0] ?? "",
      cor: a.categoria === "prazo" ? "bg-status-danger" : a.categoria === "audiencia" ? "bg-gold" : "bg-status-info",
    })),
  ].sort((x, y) => (x.hora || "99").localeCompare(y.hora || "99"));

  const primeiroNome = profile.full_name.replace(/^(Dr\.?|Dra\.?)\s+/i, "").split(" ")[0] ?? "";
  const dataCurta = new Date()
    .toLocaleDateString("pt-BR", { timeZone: "America/Bahia", weekday: "long", day: "2-digit", month: "short" })
    .replace(".", "")
    .replace("-feira", "");
  const horaAgora = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
  const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios.replace("#", String(n)));

  // resumo do dia numa frase (só o que existe)
  const resumo: React.ReactNode[] = [];
  if (deHoje.length) resumo.push(<>Hoje vence{deHoje.length > 1 ? "m" : ""} <strong className="font-semibold text-foreground">{plural(deHoje.length, "1 atividade sua", "# atividades suas")}</strong>.</>);
  else resumo.push(<>Nada seu vence hoje.</>);
  if (atrasadas.length) resumo.push(<><strong className="font-semibold text-status-danger">{plural(atrasadas.length, "1 está atrasada", "# estão atrasadas")}</strong>.</>);
  if (agendaHoje.length) resumo.push(<>A agenda {verEquipe ? "do escritório " : ""}tem <strong className="font-semibold text-foreground">{plural(agendaHoje.length, "1 item", "# itens")}</strong> hoje.</>);
  if (pendentesDistribuicao) resumo.push(<>Chegaram <strong className="font-semibold text-foreground">{plural(pendentesDistribuicao, "1 pedido", "# pedidos")}</strong> para distribuir.</>);
  if (publicacoesPendentes) resumo.push(<>Há <strong className="font-semibold text-foreground">{plural(publicacoesPendentes, "1 publicação", "# publicações")}</strong> não tratada{publicacoesPendentes > 1 ? "s" : ""}.</>);

  // "Precisa de você": atrasadas e de hoje primeiro, depois as caixas de entrada
  const agora = [
    ...atrasadas.slice(0, 4).map((a) => ({
      chave: `at-${a.id}`,
      href: `/admin/activities/${a.id}`,
      titulo: a.title,
      detalhe: `${a.clients?.name ?? "Sem cliente"} · venceu ${a.deadline!.split("-").reverse().slice(0, 2).join("/")}`,
      cor: "bg-status-danger",
    })),
    ...deHoje.slice(0, 3).map((a) => ({
      chave: `hj-${a.id}`,
      href: `/admin/activities/${a.id}`,
      titulo: a.title,
      detalhe: `${a.clients?.name ?? "Sem cliente"} · vence hoje${a.hora ? ` às ${a.hora.slice(0, 5)}` : ""}`,
      cor: "bg-status-pending",
    })),
    ...(pendentesDistribuicao
      ? [{ chave: "dist", href: "/admin/distribuicao", titulo: plural(pendentesDistribuicao, "1 pedido para distribuir", "# pedidos para distribuir"), detalhe: "WhatsApp e portal do cliente", cor: "bg-gold" }]
      : []),
    ...(publicacoesPendentes
      ? [{ chave: "pub", href: "/admin/publicacoes", titulo: plural(publicacoesPendentes, "1 publicação não tratada", "# publicações não tratadas"), detalhe: "Diário oficial e INPI", cor: "bg-status-info" }]
      : []),
  ].slice(0, 7);

  const linhasRanking = verEquipe ? ranking(activities, pessoas, periodo) : ranking(activities, pessoas.filter((p) => p.id === meuResponsavel), periodo);
  const maxConcluidas = Math.max(1, ...linhasRanking.map((l) => l.concluidas));
  const topClientes = clientesComMaisPendencias(activities, 8);
  const maxPend = Math.max(1, ...topClientes.map((c) => c.abertas));


  return (
    <div>
      {/* abertura: saudação grande, resumo do dia numa frase e o número que mais importa */}
      <section className="mb-10 grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="eyebrow flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-status-success" aria-hidden /> {dataCurta} · atualizado {horaAgora}
          </p>
          <h1 className="page-title mt-3 !text-[2.6rem] !leading-[1.02] sm:!text-[3.25rem]">
            {saudacao()},
            <br />
            <span className="text-foreground/30">{primeiroNome || "equipe"}.</span>
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-foreground/70">
            {resumo.map((parte, i) => (
              <span key={i}>
                {i > 0 ? " " : ""}
                {parte}
              </span>
            ))}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href="/admin/agenda" className="ui-btn">
              Ver meu dia <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            {permissoes.distribuicao && pendentesDistribuicao > 0 && (
              <Link href="/admin/distribuicao" className="ui-btn-secondary">
                Distribuir {pendentesDistribuicao} pedido{pendentesDistribuicao > 1 ? "s" : ""}
              </Link>
            )}
          </div>
        </div>

        <Link
          href={atrasadas.length ? "/admin/activities?prazo=atrasadas" : "/admin/agenda"}
          className="group relative overflow-hidden rounded-2xl bg-navy p-6 text-white transition-transform duration-200 hover:-translate-y-0.5"
        >
          <span className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full border border-white/10" aria-hidden />
          <span className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full border border-white/10" aria-hidden />
          <p className="eyebrow flex items-center gap-2 !text-white/55">
            <span className={`h-1.5 w-1.5 rounded-full ${atrasadas.length ? "bg-[#ff6b6b]" : "bg-gold"}`} aria-hidden />
            {atrasadas.length ? "Atrasadas" : "Prazos · hoje"}
          </p>
          <p className="numero-grande mt-3 text-[5.5rem] leading-none text-white">{atrasadas.length || deHoje.length}</p>
          <p className="font-display mt-2 text-lg leading-tight font-bold">
            {atrasadas.length
              ? atrasadas.length === 1
                ? "atividade sua está atrasada."
                : "atividades suas estão atrasadas."
              : deHoje.length === 1
                ? "atividade vence hoje."
                : "atividades vencem hoje."}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/60">
            {daSemana.length} nos próximos 7 dias{atrasadas.length && deHoje.length ? ` · ${deHoje.length} vence(m) hoje` : ""}.
          </p>
          <p className="eyebrow mt-5 flex items-center justify-between !text-gold-2">
            <span>{atrasadas.length ? "Ver atrasadas" : "Abrir agenda"}</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </p>
        </Link>
      </section>

      {/* agora: o que precisa de atenção, numerado */}
      {agora.length > 0 && (
        <section className="mb-10">
          <p className="eyebrow">Agora</p>
          <h2 className="page-title mt-1 !text-2xl">Precisa de você.</h2>
          <ol className="mt-4 border-b border-border">
            {agora.map((item, i) => (
              <li key={item.chave}>
                <Link href={item.href} className="lista-linha group">
                  <span className="eyebrow w-6 shrink-0 !text-[11px]">{String(i + 1).padStart(2, "0")}</span>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${item.cor}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{item.titulo}</span>
                    <span className="block truncate text-xs text-muted">{item.detalhe}</span>
                  </span>
                  <span className="eyebrow shrink-0 transition-colors group-hover:!text-foreground">Abrir ›</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* faixa de números */}
      <section className="mb-10 grid grid-cols-2 border-y border-border md:grid-cols-4">
        {[
          { n: atrasadas.length, rotulo: "Suas atrasadas", href: "/admin/activities?prazo=atrasadas", cor: atrasadas.length ? "text-status-danger" : "" },
          { n: deHoje.length, rotulo: "Vencem hoje", href: "/admin/agenda", cor: "" },
          { n: daSemana.length, rotulo: "Próximos 7 dias", href: "/admin/activities?prazo=semana", cor: "" },
          permissoes.distribuicao
            ? { n: pendentesDistribuicao, rotulo: "Para distribuir", href: "/admin/distribuicao", cor: pendentesDistribuicao ? "text-gold-ink" : "" }
            : { n: abertasMinhas.length, rotulo: "Em aberto", href: "/admin/activities", cor: "" },
        ].map((c, i) => (
          <Link
            key={c.rotulo}
            href={c.href}
            className={`px-1 py-5 transition-colors hover:bg-[#f7f7f4] md:px-6 ${i > 0 ? "md:border-l md:border-border" : ""} ${i % 2 ? "border-l border-border md:border-l" : ""} ${i > 1 ? "border-t border-border md:border-t-0" : ""}`}
          >
            <p className={`numero-grande text-4xl ${c.cor}`}>{c.n}</p>
            <p className="eyebrow mt-1">{c.rotulo}</p>
          </Link>
        ))}
      </section>

      {isAdmin && inadimplentes.length > 0 && (
        <Link
          href="/admin/financial"
          className="mt-3 flex items-center gap-2 rounded-xl border border-status-danger/25 bg-status-danger/[0.06] px-4 py-2.5 text-sm text-status-danger transition-colors hover:bg-status-danger/[0.1]"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {inadimplentes.length} cobrança(s) em atraso · {formatCurrency(inadimplentes.reduce((s, f) => s + Number(f.amount), 0))}
          <ArrowRight className="ml-auto h-4 w-4" aria-hidden />
        </Link>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[1.4fr_1fr]">
        {/* agenda de hoje */}
        <section className="ui-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="section-title flex items-center gap-2">
              <Sun className="h-4 w-4 text-gold" aria-hidden /> Agenda de hoje {verEquipe ? "do escritório" : ""}
            </h2>
            <div className="flex items-center gap-3">
              <Link href="/admin/agenda/compromisso/novo" className="ui-link text-xs">
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> Compromisso
              </Link>
              <Link href="/admin/agenda" className="ui-link text-xs">
                Agenda <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
          {agendaHoje.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Nada marcado para hoje.</p>
          ) : (
            <ul className="divide-y divide-border">
              {agendaHoje.map((i) => (
                <li key={i.chave}>
                  <Link href={i.href} className="flex items-center gap-3 px-1 py-2.5 text-sm hover:bg-surface-2">
                    <span className="w-11 shrink-0 text-xs font-medium text-foreground tabular-nums">{i.hora || "—"}</span>
                    <span className={`h-2 w-2 shrink-0 rounded-full ${i.cor}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{i.titulo}</span>
                      <span className="block truncate text-xs text-muted">
                        {i.rotulo}
                        {i.cliente ? ` · ${i.cliente}` : ""}
                      </span>
                    </span>
                    {i.quem && <span className="hidden max-w-32 truncate text-xs text-muted sm:inline">{i.quem}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ranking */}
        <section className="ui-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="section-title flex items-center gap-2">
              <Trophy className="h-4 w-4 text-gold" aria-hidden /> {verEquipe ? "Quem mais concluiu" : "Seu desempenho"}
            </h2>
            <div className="inline-flex rounded-lg bg-surface-2 p-0.5 text-xs">
              {[7, 30].map((p) => (
                <Link
                  key={p}
                  href={p === 7 ? "/admin" : "/admin?periodo=30"}
                  scroll={false}
                  className={`rounded-md px-2 py-0.5 ${periodo === p ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted"}`}
                >
                  {p} dias
                </Link>
              ))}
            </div>
          </div>
          {linhasRanking.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Ninguém concluiu atividades neste período.</p>
          ) : (
            <ol className="space-y-2.5">
              {linhasRanking.slice(0, 8).map((l, i) => (
                <li key={l.responsavelId} className="flex items-center gap-3">
                  <span className={`w-5 text-center text-sm font-semibold tabular-nums ${i === 0 && l.concluidas ? "text-gold" : "text-muted"}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-foreground">{l.nome}</span>
                      <span className="text-xs text-muted tabular-nums">
                        <strong className="text-sm text-foreground">{l.concluidas}</strong> feitas · {l.abertas} abertas
                        {l.atrasadas ? <span className="text-status-danger"> · {l.atrasadas} atrasadas</span> : null}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-navy-3" style={{ width: `${(l.concluidas / maxConcluidas) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {isAdmin && (
            <Link href="/admin/team?aba=demandas" className="ui-link mt-4 text-xs">
              Demandas de cada um <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </section>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[1fr_1.4fr]">
        {/* clientes com mais pendências */}
        <section className="ui-card p-5">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted" aria-hidden /> Clientes com mais em aberto
          </h2>
          {topClientes.length === 0 ? (
            <EmptyState icon={Inbox} title="Nenhum cliente com pendências" compact />
          ) : (
            <ul className="space-y-2.5">
              {topClientes.map((c) => (
                <li key={c.id}>
                  <Link href={permissoes.clientes ? `/admin/clients/${c.id}?aba=atividades` : `/admin/activities`} className="group block">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate text-foreground group-hover:underline">{c.nome}</span>
                      <span className="text-xs text-muted tabular-nums">
                        <strong className="text-sm text-foreground">{c.abertas}</strong> em aberto
                        {c.atrasadas ? <span className="text-status-danger"> · {c.atrasadas} atrasadas</span> : null}
                      </span>
                    </div>
                    <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full bg-status-danger" style={{ width: `${(c.atrasadas / maxPend) * 100}%` }} />
                      <div className="h-full bg-gold" style={{ width: `${((c.abertas - c.atrasadas) / maxPend) * 100}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* pipeline */}
        {permissoes.clientes && (
          <section className="ui-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="section-title">Onde está cada cliente</h2>
              <Link href="/admin/clients?ver=pipeline" className="ui-link text-xs">
                Ver pipeline <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            <PipelineBoard cartoes={pipeline} compacto />
          </section>
        )}
      </div>

      <div className="mt-6">
        <QuadroInicial minhas={minhas} todas={noQuadro} rotuloTodas={isAdmin ? "Todas do escritório" : "Dos meus clientes"} />
        <p className="mt-2 text-xs text-muted">
          Concluídas dos últimos {CONCLUIDAS_DIAS} dias. Arraste o cartão para mudar o status; clique para abrir.{" "}
          <Link href="/admin/activities" className="ui-link">
            Ver todas as atividades
          </Link>
        </p>
      </div>
    </div>
  );
}
