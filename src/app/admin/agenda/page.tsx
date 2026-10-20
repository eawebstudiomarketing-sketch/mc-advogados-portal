import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, CalendarPlus } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listClients } from "@/lib/data/clients";
import { listPessoas } from "@/lib/data/escritorio";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { MeuDia } from "./meu-dia";
import { QuemFiltro } from "./quem-filtro";
import { PeriodoFiltro } from "@/components/ui/periodo-filtro";
import { lerPeriodo } from "@/lib/periodo";

// Agenda: prazos, audiências e tarefas (atividades com data) + compromissos
// (reunião, ligação, evento) num calendário do mês, e "Meu dia" com a rotina
// de cada pessoa. Cada um vê o que já pode ver (regras do banco).

type Item = {
  id: string;
  href: string;
  titulo: string;
  dia: string;
  hora: string | null;
  categoria: string; // tarefa | prazo | audiencia | compromisso
  concluida: boolean;
  aberta: boolean;
  cliente: string | null;
};

const COR: Record<string, string> = {
  compromisso: "border-l-roxo bg-roxo-bg text-roxo-ink",
  audiencia: "border-l-gold bg-gold/15 text-navy",
  prazo: "border-l-status-danger bg-status-danger-bg text-status-danger",
  tarefa: "border-l-status-info bg-status-info-bg text-status-info",
};
const ROTULO: Record<string, string> = { compromisso: "Compromisso", audiencia: "Audiência", prazo: "Prazo", tarefa: "Tarefa" };
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const dataBR = (s: string) => s.split("-").reverse().join("/");
const diaBahia = (isoTs: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(isoTs));
const horaBahia = (isoTs: string) => new Date(isoTs).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });

type Params = { mes?: string; ver?: string; aba?: string; dia?: string; quem?: string; categoria?: string; cliente?: string; periodo?: string; de?: string; ate?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { profile } = await exigirPermissao("agenda");
  const sp = await searchParams;
  const hoje = hojeBahia();
  const ehAdmin = profile.role === "admin";

  const [pessoas, eu] = await Promise.all([listPessoas(), responsavelDoPerfil(profile.id)]);

  // período: hoje (linha do tempo), esta semana / personalizado (lista por dia) ou este mês (calendário)
  const periodo = lerPeriodo(
    { ...sp, periodo: sp.periodo ?? (sp.aba === "mes" || sp.mes ? "mes" : undefined) },
    hoje
  );
  const abaAtiva = periodo.chave === "hoje" ? "dia" : periodo.chave === "mes" ? "mes" : "lista";
  // de quem: o admin escolhe (minhas, todos ou uma pessoa); o advogado vê só a dele
  const quem = !ehAdmin
    ? "eu"
    : sp.quem === "todos" || sp.quem === "eu" || pessoas.some((p) => p.id === sp.quem)
      ? sp.quem!
      : abaAtiva === "dia"
        ? "eu"
        : "todos";
  const filtroPessoa: string | null = quem === "todos" ? null : quem === "eu" ? (eu ?? "__ninguem__") : quem;
  const link = (mudar: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ ...sp, aba: undefined, periodo: periodo.chave, quem, ...mudar }).filter(([, v]) => v) as [string, string][]);
    return `/admin/agenda?${q}`;
  };
  const filtroQuem = ehAdmin ? (
    <QuemFiltro pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome, foto: p.foto }))} atual={quem} href={(q) => link({ quem: q })} />
  ) : null;
  const abas = (
    <div className="mb-5">
      <PeriodoFiltro
        atual={periodo}
        base="/admin/agenda"
        manter={{ quem: ehAdmin ? quem : undefined, categoria: sp.categoria, cliente: sp.cliente, ver: sp.ver }}
      />
    </div>
  );

  const cabecalho = (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="eyebrow mb-2">Operacional · Agenda</p>
        <h1 className="page-title">Agenda</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/agenda/compromisso/novo" className="ui-btn">
          <CalendarPlus className="h-4 w-4" aria-hidden /> Novo compromisso
        </Link>
        <Link href="/admin/activities/new" className="ui-btn-secondary">
          <Plus className="h-4 w-4" aria-hidden /> Nova atividade
        </Link>
      </div>
    </div>
  );

  if (abaAtiva === "dia") {
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(sp.dia ?? "") ? sp.dia! : hoje;
    return (
      <div>
        {cabecalho}
        {abas}
        {filtroQuem && <div className="mb-5">{filtroQuem}</div>}
        <MeuDia
          meuId={eu}
          pessoaId={filtroPessoa}
          dia={dia}
          hoje={hoje}
          pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome, foto: p.foto }))}
          hrefDia={(d) => link({ dia: d === hoje ? undefined : d })}
        />
      </div>
    );
  }

  // ───────────── mês ─────────────
  const [ano, m] = (/^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : hoje.slice(0, 7)).split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1));
  const inicioGrade = new Date(primeiro);
  inicioGrade.setUTCDate(1 - primeiro.getUTCDay());
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrade);
    d.setUTCDate(inicioGrade.getUTCDate() + i);
    return iso(d);
  });
  const fimLista = (() => {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 14);
    return iso(d);
  })();
  const de = dias[0] < hoje ? dias[0] : hoje;
  const ate = dias[41] > fimLista ? dias[41] : fimLista;
  const mostrarConcluidas = sp.ver === "todas";
  const respFiltro = filtroPessoa;
  const buscarItens = async (de: string, ate: string) => {
    const supabase = await createClient();
    let qa = supabase
      .from("activities")
      .select("id, title, deadline, hora, categoria, status, client_id, clients(name)")
      .is("archived_at", null)
      .not("deadline", "is", null)
      .gte("deadline", de)
      .lte("deadline", ate)
      .order("deadline")
      .order("hora", { nullsFirst: true });
    if (!mostrarConcluidas) qa = qa.in("status", ["aberta", "em_andamento"]);
    if (sp.cliente) qa = qa.eq("client_id", sp.cliente);
    if (respFiltro) qa = qa.or(`responsavel_id.eq.${respFiltro},envolvidos.cs.{${respFiltro}}`);
    let qc = supabase
      .from("compromissos")
      .select("id, titulo, inicio, client_id, clients(name)")
      .gte("inicio", new Date(`${de}T00:00:00-03:00`).toISOString())
      .lte("inicio", new Date(`${ate}T23:59:59-03:00`).toISOString())
      .order("inicio");
    if (sp.cliente) qc = qc.eq("client_id", sp.cliente);
    if (respFiltro) qc = qc.contains("participantes", [respFiltro]);

    const [{ data: ativs }, { data: comps }, clientes] = await Promise.all([qa, qc, listClients()]);
    const nomeCliente = (c: unknown) => (c as { name: string } | null)?.name ?? null;
    let itens: Item[] = [
      ...(comps ?? []).map((c) => ({
        id: c.id,
        href: `/admin/agenda/compromisso/${c.id}`,
        titulo: c.titulo,
        dia: diaBahia(c.inicio),
        hora: horaBahia(c.inicio),
        categoria: "compromisso",
        concluida: false,
        aberta: true,
        cliente: nomeCliente(c.clients),
      })),
      ...(ativs ?? []).map((a) => ({
        id: a.id,
        href: `/admin/activities/${a.id}`,
        titulo: a.title,
        dia: a.deadline!,
        hora: a.hora ? a.hora.slice(0, 5) : null,
        categoria: a.categoria,
        concluida: a.status === "concluida" || a.status === "cancelada",
        aberta: a.status === "aberta" || a.status === "em_andamento",
        cliente: nomeCliente(a.clients),
      })),
    ];
    if (sp.categoria) itens = itens.filter((i) => i.categoria === sp.categoria);
    itens.sort((a, b) => a.dia.localeCompare(b.dia) || (a.hora ?? "").localeCompare(b.hora ?? ""));
    return { itens, clientes };
  };

  const filtrosTipoCliente = (clientes: { id: string; name: string }[]) => (
    <BarraFiltros
      filtros={[
        {
          tipo: "select",
          nome: "categoria",
          rotulo: "Tipo",
          todos: "Tudo",
          opcoes: Object.entries(ROTULO).map(([v, r]) => ({ valor: v, rotulo: r })),
        },
        { tipo: "select", nome: "cliente", rotulo: "Cliente", todos: "Todos os clientes", opcoes: clientes.map((c) => ({ valor: c.id, rotulo: c.name })) },
      ]}
    />
  );

  // ───────────── semana / personalizado: lista por dia ─────────────
  if (abaAtiva === "lista") {
    const { itens: doPeriodo, clientes } = await buscarItens(periodo.de, periodo.ate);
    const grupos = new Map<string, Item[]>();
    for (const it of doPeriodo) grupos.set(it.dia, [...(grupos.get(it.dia) ?? []), it]);
    const diasComItens = [...grupos.keys()].sort();
    return (
      <div>
        {cabecalho}
        {abas}
        {filtroQuem && <div className="mb-3">{filtroQuem}</div>}
        {filtrosTipoCliente(clientes)}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="eyebrow">
            {periodo.rotulo} · {doPeriodo.length} {doPeriodo.length === 1 ? "item" : "itens"}
          </p>
          <Link href={link({ ver: mostrarConcluidas ? undefined : "todas" })} className="text-xs font-medium text-navy-3 hover:underline">
            {mostrarConcluidas ? "Ocultar concluídas" : "Mostrar concluídas"}
          </Link>
        </div>
        {diasComItens.length === 0 ? (
          <div className="ui-card flex flex-col items-center gap-1 py-12 text-center">
            <p className="font-display text-base font-bold text-foreground">Nada marcado neste período.</p>
            <p className="text-xs text-muted">Troque o período ou os filtros acima.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {diasComItens.map((d) => {
              const semana = new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
              return (
                <section key={d} className="ui-card overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                    <Link href={link({ periodo: "hoje", dia: d })} className="text-sm font-semibold text-foreground capitalize hover:underline">
                      {d === hoje ? <span className="mr-1.5 rounded-full bg-navy px-2 py-0.5 text-[11px] text-white normal-case">Hoje</span> : null}
                      {semana}
                    </Link>
                    <span className="eyebrow">{grupos.get(d)!.length}</span>
                  </div>
                  <ul className="divide-y divide-border">
                    {grupos.get(d)!.map((it) => (
                      <li key={`${it.categoria}-${it.id}`}>
                        <Link href={it.href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                          <span className="numero-grande w-12 shrink-0 text-right text-sm text-foreground">{it.hora ?? "—"}</span>
                          <span className={`h-8 w-1 shrink-0 rounded-full border-l-4 ${COR[it.categoria] ?? COR.tarefa}`} aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className={`block truncate text-sm font-medium text-foreground ${it.concluida ? "line-through opacity-60" : ""}`}>{it.titulo}</span>
                            <span className="block truncate text-xs text-muted">
                              {ROTULO[it.categoria] ?? "Tarefa"}
                              {it.cliente ? ` · ${it.cliente}` : ""}
                            </span>
                          </span>
                          {d < hoje && it.aberta && it.categoria !== "compromisso" && (
                            <span className="shrink-0 rounded-full bg-status-danger-bg px-2 py-0.5 text-[11px] font-semibold text-status-danger">Atrasada</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const { itens, clientes } = await buscarItens(de, ate);
  const porDia = new Map<string, Item[]>();
  for (const it of itens) porDia.set(it.dia, [...(porDia.get(it.dia) ?? []), it]);
  const proximos = itens.filter((i) => i.dia >= hoje && i.dia <= fimLista && i.aberta);

  const mesAnterior = `${m === 1 ? ano - 1 : ano}-${pad(m === 1 ? 12 : m - 1)}`;
  const mesSeguinte = `${m === 12 ? ano + 1 : ano}-${pad(m === 12 ? 1 : m + 1)}`;
  const manter = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ periodo: "mes" });
    for (const k of ["ver", "categoria", "cliente"] as const) if (sp[k]) q.set(k, sp[k]!);
    if (ehAdmin) q.set("quem", quem);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    else q.delete(k);
    return `/admin/agenda?${q}`;
  };

  return (
    <div>
      {cabecalho}
      {abas}
      {filtroQuem && <div className="mb-3">{filtroQuem}</div>}
      {filtrosTipoCliente(clientes)}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
        <section className="ui-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-1">
              <Link href={manter({ mes: mesAnterior })} className="icon-btn" aria-label="Mês anterior" data-tip="Mês anterior">
                <ChevronLeft aria-hidden />
              </Link>
              <h2 className="min-w-40 text-center text-sm font-semibold text-foreground">
                {MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} de {ano}
              </h2>
              <Link href={manter({ mes: mesSeguinte })} className="icon-btn" aria-label="Próximo mês" data-tip="Próximo mês">
                <ChevronRight aria-hidden />
              </Link>
              <Link href={manter({ mes: "" })} className="ml-2 text-xs font-medium text-navy-3 hover:underline">
                Hoje
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
              {Object.entries(ROTULO).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-sm border-l-2 ${COR[k]}`} aria-hidden /> {v}
                </span>
              ))}
              <Link href={manter({ mes: `${ano}-${pad(m)}`, ver: mostrarConcluidas ? "" : "todas" })} className="font-medium text-navy-3 hover:underline">
                {mostrarConcluidas ? "Ocultar concluídas" : "Mostrar concluídas"}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-[11px] font-medium text-muted">
            {DIAS.map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((d) => {
              const doMes = d.slice(0, 7) === `${ano}-${pad(m)}`;
              const lista = porDia.get(d) ?? [];
              return (
                <div key={d} className={`group/dia relative min-h-24 border-r border-b border-border p-1.5 [&:nth-child(7n)]:border-r-0 ${doMes ? "" : "bg-surface-2/60"}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link
                      href={`/admin/agenda/compromisso/novo?dia=${d}`}
                      aria-label={`Novo compromisso em ${dataBR(d)}`}
                      className="rounded p-0.5 text-muted opacity-0 transition-opacity group-hover/dia:opacity-100 hover:bg-surface-2 focus:opacity-100"
                    >
                      <Plus className="h-3 w-3" aria-hidden />
                    </Link>
                    <Link
                      href={link({ periodo: "hoje", dia: d, mes: undefined })}
                      className={`text-[11px] ${
                        d === hoje ? "flex h-5 w-5 items-center justify-center rounded-full bg-navy font-semibold text-white" : doMes ? "text-foreground/70 hover:underline" : "text-muted/60"
                      }`}
                    >
                      {Number(d.slice(8))}
                    </Link>
                  </div>
                  <ul className="space-y-1">
                    {lista.slice(0, 3).map((it) => (
                      <li key={`${it.categoria}-${it.id}`}>
                        <Link
                          href={it.href}
                          title={`${ROTULO[it.categoria] ?? "Tarefa"}${it.hora ? ` às ${it.hora}` : ""}: ${it.titulo}${it.cliente ? ` · ${it.cliente}` : ""}`}
                          className={`block truncate rounded border-l-2 px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-95 ${COR[it.categoria] ?? COR.tarefa} ${
                            it.concluida ? "line-through opacity-60" : ""
                          } ${d < hoje && it.aberta && it.categoria !== "compromisso" ? "ring-1 ring-status-danger" : ""}`}
                        >
                          {it.hora ? <strong className="font-semibold">{it.hora} </strong> : null}
                          {it.titulo}
                        </Link>
                      </li>
                    ))}
                    {lista.length > 3 && (
                      <li className="px-1 text-[10px] text-muted">
                        <Link href={link({ periodo: "hoje", dia: d, mes: undefined })} className="hover:underline">
                          +{lista.length - 3} mais
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="ui-card h-fit p-5">
          <h2 className="section-title">Próximos 14 dias</h2>
          {proximos.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nada com data nos próximos 14 dias.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {proximos.map((it) => (
                <li key={`${it.categoria}-${it.id}`}>
                  <Link href={it.href} className="group block">
                    <p className="text-xs text-muted">
                      {it.dia === hoje ? <span className="font-semibold text-status-pending">Hoje</span> : dataBR(it.dia)}
                      {it.hora ? ` · ${it.hora}` : ""} ·{" "}
                      <span
                        className={
                          it.categoria === "prazo"
                            ? "text-status-danger"
                            : it.categoria === "audiencia"
                              ? "font-medium text-navy"
                              : it.categoria === "compromisso"
                                ? "font-medium text-roxo-ink"
                                : ""
                        }
                      >
                        {ROTULO[it.categoria] ?? "Tarefa"}
                      </span>
                    </p>
                    <p className="text-sm text-foreground group-hover:underline">{it.titulo}</p>
                    {it.cliente && <p className="text-xs text-muted">{it.cliente}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
