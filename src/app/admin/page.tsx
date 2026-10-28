import Link from "next/link";
import { PeriodoFiltro } from "@/components/ui/periodo-filtro";
import { lerPeriodo } from "@/lib/periodo";
import { pontosDeRotina, rotinaDoDia, rotinaOutrosDias } from "@/lib/data/rotina-diaria";
import { MinhaRotina } from "@/components/rotina/minha-rotina";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { AlertTriangle, ArrowRight, Trophy, Sun, CalendarPlus } from "lucide-react";
import { listActivities, type Activity } from "@/lib/data/activities";
import { listFinancialRecords } from "@/lib/data/financial";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { listPessoas } from "@/lib/data/escritorio";
import { contarDistribuicaoPendentes } from "@/lib/data/distribuicao";
import { contarNaoTratadas } from "@/lib/data/publicacoes";
import { ranking, clientesComMaisPendencias, hojeBahia, emAberto, somaDias } from "@/lib/data/painel";
import { Avatar } from "@/components/ui/avatar";
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
const ROTULO_TIPO: Record<string, string> = { reuniao: "Reunião", audiencia: "Audiência", ligacao: "Ligação", evento: "Evento", outro: "Compromisso" };
const horaBahia = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });

// Visão geral: o dia do escritório numa tela só. Números da pessoa, agenda de
// hoje, ranking da equipe, clientes com mais pendências, pipeline dos
// clientes e o quadro das atividades.
export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; agenda?: string; ade?: string; aate?: string }>;
}) {
  const { profile, permissoes } = await exigirPermissao("visao_geral");
  const isAdmin = profile.role === "admin";
  const verEquipe = permissoes.ver_equipe;
  const sp = await searchParams;
  const periodo = sp.periodo === "30" ? 30 : 7;
  const hoje = hojeBahia();
  // agenda do painel: hoje, esta semana, este mês ou personalizado
  const agendaPeriodo = lerPeriodo({ periodo: sp.agenda, de: sp.ade, ate: sp.aate }, hoje);
  const etiquetasP = listEtiquetas();

  const supabase = await createClient();
  const [activities, financeiro, meuResponsavel, pessoas, pendentesDistribuicao, publicacoesPendentes, { data: compsHoje }] = await Promise.all([
    listActivities(),
    permissoes.financeiro ? listFinancialRecords() : Promise.resolve(null),
    responsavelDoPerfil(profile.id),
    listPessoas(),
    permissoes.distribuicao ? contarDistribuicaoPendentes().catch(() => 0) : Promise.resolve(0),
    isAdmin ? contarNaoTratadas().catch(() => 0) : Promise.resolve(0),
    supabase
      .from("compromissos")
      .select("id, titulo, tipo, inicio, participantes, clients(name)")
      .gte("inicio", new Date(`${agendaPeriodo.de}T00:00:00-03:00`).toISOString())
      .lt("inicio", new Date(`${somaDias(agendaPeriodo.ate, 1)}T00:00:00-03:00`).toISOString())
      .order("inicio"),
  ]);

  const corte = Date.parse(hoje) - CONCLUIDAS_DIAS * 86_400_000;
  const noQuadro = activities.filter((a) => emAberto(a) || (a.status === "concluida" && Date.parse(a.updated_at) >= corte));
  const ehMinha = (a: Activity) =>
    (meuResponsavel ? a.responsavel_id === meuResponsavel || (a.envolvidos ?? []).includes(meuResponsavel) : false) ||
    (!a.responsavel_id && a.responsible_id === profile.id);
  const minhas = noQuadro.filter(ehMinha);
  const abertasMinhas = minhas.filter(emAberto);
  const atrasadas = abertasMinhas.filter((a) => a.deadline && a.deadline < hoje);
  const deHoje = abertasMinhas.filter((a) => a.deadline === hoje);
  const daSemana = abertasMinhas.filter((a) => a.deadline && a.deadline > hoje && a.deadline <= somaDias(hoje, 7));
  const inadimplentes = financeiro?.filter((f) => f.status === "overdue") ?? [];

  // agenda de hoje: do escritório (quem vê a equipe) ou só a da pessoa
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p]));
  const ativsHoje = activities.filter(
    (a) => emAberto(a) && !!a.deadline && a.deadline >= agendaPeriodo.de && a.deadline <= agendaPeriodo.ate && (verEquipe || ehMinha(a))
  );
  const comps = (compsHoje ?? []).filter((c) => verEquipe || (meuResponsavel && c.participantes.includes(meuResponsavel)));
  const agendaHoje = [
    ...comps.map((c) => ({
      chave: `c-${c.id}`,
      dia: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(c.inicio)),
      href: `/admin/agenda/compromisso/${c.id}`,
      hora: horaBahia(c.inicio),
      rotulo: ROTULO_TIPO[c.tipo] ?? "Compromisso",
      titulo: c.titulo,
      cliente: (c.clients as unknown as { name: string } | null)?.name ?? null,
      pessoas: c.participantes,
      cor: "bg-[#7c5cc4]",
    })),
    ...ativsHoje.map((a) => ({
      chave: `a-${a.id}`,
      dia: a.deadline!,
      href: `/admin/activities/${a.id}`,
      hora: a.hora ? a.hora.slice(0, 5) : "",
      rotulo: ROTULO_CAT[a.categoria] ?? "Tarefa",
      titulo: a.title,
      cliente: a.clients?.name ?? null,
      pessoas: [...(a.responsavel_id ? [a.responsavel_id] : []), ...(a.envolvidos ?? [])],
      cor: a.categoria === "prazo" ? "bg-status-danger" : a.categoria === "audiencia" ? "bg-gold" : "bg-status-info",
    })),
  ].sort((x, y) => x.dia.localeCompare(y.dia) || (x.hora || "99").localeCompare(y.hora || "99"));
  const etiquetas = await etiquetasP;
  const agendaSoHoje = agendaHoje.filter((i) => i.dia === hoje);
  const variosDias = agendaPeriodo.de !== agendaPeriodo.ate;
  const linkAgenda = `/admin/agenda?periodo=${agendaPeriodo.chave}${agendaPeriodo.chave === "personalizado" ? `&de=${agendaPeriodo.de}&ate=${agendaPeriodo.ate}` : ""}`;

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
  if (agendaSoHoje.length) resumo.push(<>A agenda {verEquipe ? "do escritório " : ""}tem <strong className="font-semibold text-foreground">{plural(agendaSoHoje.length, "1 item", "# itens")}</strong> hoje.</>);
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

  const [pontosRotina, minhaRotina, rotinaOutros] = await Promise.all([
    pontosDeRotina(somaDias(hoje, -periodo + 1)),
    meuResponsavel ? rotinaDoDia(meuResponsavel, hoje) : Promise.resolve([]),
    meuResponsavel ? rotinaOutrosDias(meuResponsavel, hoje) : Promise.resolve([]),
  ]);
  const linhasRanking = verEquipe
    ? ranking(activities, pessoas, periodo, pontosRotina)
    : ranking(activities, pessoas.filter((p) => p.id === meuResponsavel), periodo, pontosRotina);
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

      {(minhaRotina.length > 0 || rotinaOutros.length > 0) && (
        <div className="mb-10">
          <MinhaRotina
            itens={minhaRotina.map((i) => ({ id: i.id, titulo: i.titulo, feito: i.feito, feitoEm: i.feitoEm, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, observacao: i.observacao, situacao: i.situacao }))}
            outrosDias={rotinaOutros.map((i) => ({ id: i.id, titulo: i.titulo, dias: i.dias, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim }))}
            podeMarcar
          />
        </div>
      )}

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
            className={`px-1 py-5 transition-colors hover:bg-hover md:px-6 ${i > 0 ? "md:border-l md:border-border" : ""} ${i % 2 ? "border-l border-border md:border-l" : ""} ${i > 1 ? "border-t border-border md:border-t-0" : ""}`}
          >
            <p className={`numero-grande text-4xl ${c.cor}`}>{c.n}</p>
            <p className="eyebrow mt-1">{c.rotulo}</p>
          </Link>
        ))}
      </section>

      {permissoes.financeiro && inadimplentes.length > 0 && (
        <Link
          href="/admin/financial"
          className="mt-3 flex items-center gap-2 rounded-xl border border-status-danger/25 bg-status-danger/[0.06] px-4 py-2.5 text-sm text-status-danger transition-colors hover:bg-status-danger/[0.1]"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {inadimplentes.length} cobrança(s) em atraso · {formatCurrency(inadimplentes.reduce((s, f) => s + Number(f.amount), 0))}
          <ArrowRight className="ml-auto h-4 w-4" aria-hidden />
        </Link>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr]">
        {/* agenda do período escolhido: linha do tempo */}
        <section id="agenda" className="ui-card scroll-mt-20 p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="eyebrow">{agendaPeriodo.rotulo}</p>
              <h2 className="section-title !text-lg">Agenda {verEquipe ? "do escritório" : ""}</h2>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/admin/agenda/compromisso/novo" className="icon-btn" aria-label="Novo compromisso" data-tip="Novo compromisso">
                <CalendarPlus aria-hidden />
              </Link>
              <Link href={linkAgenda} className="icon-btn" aria-label="Abrir agenda" data-tip="Abrir agenda">
                <ArrowRight aria-hidden />
              </Link>
            </div>
          </div>
          <div className="mb-3">
            <PeriodoFiltro
              atual={agendaPeriodo}
              base="/admin"
              ancora="agenda"
              nomes={{ periodo: "agenda", de: "ade", ate: "aate" }}
              manter={{ periodo: sp.periodo }}
            />
          </div>
          {agendaHoje.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-10 text-center">
              <Sun className="h-6 w-6 text-gold" aria-hidden />
              <p className="font-display text-base font-bold text-foreground">{variosDias ? "Período livre." : "Dia livre."}</p>
              <p className="text-xs text-muted">{variosDias ? "Nada marcado neste período." : "Nada marcado para hoje."}</p>
            </div>
          ) : (
            <ol className="-mx-2">
              {agendaHoje.slice(0, variosDias ? 10 : 7).map((i, n, lista) => (
                <li key={i.chave}>
                  {variosDias && (n === 0 || lista[n - 1].dia !== i.dia) && (
                    <p className={`eyebrow px-2 pb-1 ${n ? "pt-3" : ""} ${i.dia === hoje ? "!text-navy" : ""}`}>
                      {i.dia === hoje
                        ? "Hoje"
                        : new Date(`${i.dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).replace(".", "")}
                    </p>
                  )}
                  <Link href={i.href} className="flex items-center gap-3.5 rounded-2xl px-2 py-2.5 transition-colors hover:bg-surface-2">
                    <span className="numero-grande w-12 shrink-0 text-right text-base text-foreground">{i.hora || "—"}</span>
                    <span className={`h-9 w-1 shrink-0 rounded-full ${i.cor}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{i.titulo}</span>
                      <span className="block truncate text-xs text-muted">{i.cliente ?? i.rotulo}</span>
                    </span>
                    <span className="flex shrink-0 -space-x-1.5">
                      {i.pessoas.slice(0, 3).map((id) => {
                        const p = pessoaPorId.get(id);
                        return p ? <Avatar key={id} nome={p.nome} foto={p.foto} tamanho={28} anel /> : null;
                      })}
                    </span>
                  </Link>
                </li>
              ))}
              {agendaHoje.length > (variosDias ? 10 : 7) && (
                <li className="px-2 pt-1">
                  <Link href={linkAgenda} className="eyebrow hover:!text-foreground">
                    + {agendaHoje.length - (variosDias ? 10 : 7)} na agenda ›
                  </Link>
                </li>
              )}
            </ol>
          )}
        </section>

        {/* ranking: pódio com foto */}
        <section className="ui-card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div>
              <p className="eyebrow">Pontos · demandas + rotina</p>
              <h2 className="section-title !text-lg">{verEquipe ? "Ranking da equipe" : "Seu desempenho"}</h2>
            </div>
            <div className="inline-flex rounded-full border border-border p-0.5 text-xs">
              {[7, 30].map((p) => (
                <Link
                  key={p}
                  href={`/admin?${new URLSearchParams(
                    Object.entries({ periodo: p === 30 ? "30" : undefined, agenda: sp.agenda, ade: sp.ade, aate: sp.aate }).filter((e): e is [string, string] => !!e[1])
                  )}`}
                  scroll={false}
                  className={`rounded-full px-2.5 py-1 font-semibold ${periodo === p ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}
                >
                  {p} dias
                </Link>
              ))}
            </div>
          </div>
          {linhasRanking.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Ninguém pontuou neste período.</p>
          ) : (
            <>
              {/* pódio: 2º, 1º, 3º */}
              <div className="flex items-end justify-center gap-3">
                {[1, 0, 2].map((pos) => {
                  const l = linhasRanking[pos];
                  if (!l) return <div key={pos} className="w-24" />;
                  const p = pessoaPorId.get(l.responsavelId);
                  const altura = pos === 0 ? "h-20" : pos === 1 ? "h-14" : "h-10";
                  return (
                    <div key={l.responsavelId} className="flex w-24 flex-col items-center">
                      <div className="relative">
                        <Avatar nome={l.nome} foto={p?.foto} tamanho={pos === 0 ? 60 : 48} className={pos === 0 ? "ring-2 ring-gold ring-offset-2" : ""} />
                        {pos === 0 && <Trophy className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-surface p-0.5 text-gold" aria-hidden />}
                      </div>
                      <p className="mt-1.5 w-full truncate text-center text-xs font-semibold text-foreground">{l.nome.replace(/^(Dr\.?|Dra\.?)\s+/i, "").split(" ")[0]}</p>
                      <div className={`mt-1.5 flex w-full ${altura} items-start justify-center rounded-t-xl ${pos === 0 ? "bg-navy text-white" : "bg-surface-2 text-foreground"}`}>
                        <span className="numero-grande mt-1.5 text-xl" title={`${l.concluidas} demanda(s) + ${l.rotina} item(ns) de rotina`}>
                          {l.pontos}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {linhasRanking.length > 3 && (
                <ol className="mt-4 space-y-1 border-t border-border pt-3">
                  {linhasRanking.slice(3, 8).map((l, i) => {
                    const p = pessoaPorId.get(l.responsavelId);
                    return (
                      <li key={l.responsavelId} className="flex items-center gap-3 px-1 py-1">
                        <span className="eyebrow w-5">{String(i + 4).padStart(2, "0")}</span>
                        <Avatar nome={l.nome} foto={p?.foto} tamanho={26} />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{l.nome}</span>
                        <span className="numero-grande text-base" title={`${l.concluidas} demanda(s) + ${l.rotina} item(ns) de rotina`}>
                          {l.pontos}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
              <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
                <span>
                  {linhasRanking.reduce((s, l) => s + l.abertas, 0)} em aberto ·{" "}
                  <span className={linhasRanking.some((l) => l.atrasadas) ? "font-semibold text-status-danger" : ""}>
                    {linhasRanking.reduce((s, l) => s + l.atrasadas, 0)} atrasadas
                  </span>
                </span>
                {permissoes.equipe && (
                  <Link href="/admin/team?aba=demandas" className="eyebrow hover:!text-foreground">
                    Por pessoa ›
                  </Link>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* clientes com mais em aberto: cartões */}
      {topClientes.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="eyebrow">Carteira</p>
              <h2 className="section-title !text-lg">Clientes com mais em aberto</h2>
            </div>
            {permissoes.clientes && (
              <Link href="/admin/clients" className="eyebrow hover:!text-foreground">
                Todos ›
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {topClientes.slice(0, 8).map((c) => (
              <Link
                key={c.id}
                href={permissoes.clientes ? `/admin/clients/${c.id}?aba=atividades` : "/admin/activities"}
                className="ui-card group flex flex-col p-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar nome={c.nome} tamanho={34} />
                  <p className="line-clamp-2 min-w-0 text-[13px] leading-tight font-semibold text-foreground">{c.nome}</p>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <span className="numero-grande text-3xl leading-none text-foreground">{c.abertas}</span>
                  {c.atrasadas > 0 ? (
                    <span className="rounded-full bg-status-danger-bg px-2 py-0.5 text-[11px] font-semibold text-status-danger">{c.atrasadas} atrasada{c.atrasadas > 1 ? "s" : ""}</span>
                  ) : (
                    <span className="eyebrow">em dia</span>
                  )}
                </div>
                <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full bg-status-danger" style={{ width: `${(c.atrasadas / maxPend) * 100}%` }} />
                  <div className="h-full bg-gold" style={{ width: `${((c.abertas - c.atrasadas) / maxPend) * 100}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10">
        <QuadroInicial etiquetas={etiquetas} minhas={minhas} todas={noQuadro} rotuloTodas={permissoes.todos_clientes ? "Todas do escritório" : "Dos meus clientes"} />
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
