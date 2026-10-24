import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirSuperAdmin } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularMetricas } from "@/lib/painel/metricas";
import { carregarBase } from "@/lib/painel/dados";
import { PERIODOS, dentro, periodoDe, type Periodo } from "@/lib/painel/base";
import { StatCard } from "@/components/ui/stat-card";
import { BarraSituacao, Barras } from "@/components/painel/graficos";
import { PainelBase } from "@/components/painel/contexto";
import { GerentePainel } from "@/components/painel/gerente";
import { QuadroAbertasAntigas, QuadroCarga, QuadroCriadasConcluidas, QuadroPorTipo } from "@/components/painel/quadros";
import { CartoesResponsaveis, FichaPessoa, type EventoLinha } from "@/components/painel/responsaveis";

export const metadata = { title: "Painel do Dono" };
export const maxDuration = 60;

// Painel do Dono 2.0 (24/10/2026): só o admin máximo (Maurício e João).
// Gerente no topo (resumo + sugestões, IA barata com cache), abas por
// assunto e um filtro em cada quadro. Conversas da IA não são monitoradas.

const ABAS = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "responsaveis", rotulo: "Responsáveis" },
  { id: "clientes", rotulo: "Clientes" },
  { id: "distribuicao", rotulo: "Distribuição" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "financeiro", rotulo: "Financeiro" },
  { id: "sistema", rotulo: "Sistema" },
] as const;
const ORIGEM: Record<string, string> = { whatsapp: "WhatsApp", portal_cliente: "Portal do cliente", publicacao: "Publicações", email: "E-mail", outro: "Outro" };
const TABELA: Record<string, string> = {
  activities: "atividade",
  clients: "cliente",
  documents: "documento",
  processes: "processo",
  financial_records: "lançamento financeiro",
  distribuicao: "item da Distribuição",
  atas: "ata",
  contracts: "contrato",
  time_entries: "horas",
  compromissos: "compromisso",
  monthly_reports: "relatório mensal",
};

const num = (v: number | null | undefined, suf = "") => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR")}${suf}`);
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const horas = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toLocaleString("pt-BR")} h` : `${Math.round(h / 24)} dias`);
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const variacao = (atual: number, antes: number) => (antes ? `${atual >= antes ? "+" : ""}${Math.round(((atual - antes) / antes) * 100)}% vs período anterior` : "sem base anterior");

function Bloco({ titulo, apoio, children }: { titulo: string; apoio?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="section-title">{titulo}</h2>
      {apoio && <p className="mt-0.5 text-sm text-muted">{apoio}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Lista({ titulo, vazio, itens }: { titulo: string; vazio: string; itens: { chave: string; texto: React.ReactNode; valor: React.ReactNode; href?: string; tom?: "danger" | "pending" | "success" }[] }) {
  const cor = { danger: "text-status-danger", pending: "text-status-pending", success: "text-status-success" };
  return (
    <div className="ui-card min-w-0 p-5">
      <p className="mb-3 text-sm font-semibold text-foreground">{titulo}</p>
      {itens.length === 0 ? (
        <p className="py-2 text-sm text-muted">{vazio}</p>
      ) : (
        <ul>
          {itens.map((i) => {
            const corpo = (
              <>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{i.texto}</span>
                <span className={`shrink-0 text-sm font-medium tabular-nums ${i.tom ? cor[i.tom] : "text-foreground"}`}>{i.valor}</span>
              </>
            );
            return (
              <li key={i.chave} className="border-t border-border first:border-t-0">
                {i.href ? (
                  <Link href={i.href} className="flex items-center gap-3 rounded-md py-2 hover:bg-[var(--hover)]">
                    {corpo}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-2">{corpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Linha do tempo de uma pessoa no período: concluídas, ações (auditoria) e comentários. */
async function linhaDoTempo(pessoaId: string, p: Periodo, base: Awaited<ReturnType<typeof carregarBase>>) {
  const db = createAdminClient() as unknown as SupabaseClient;
  const r = base.responsaveis.find((x) => x.id === pessoaId);
  const nomeCli = (id: string | null) => (id ? base.clientes.find((c) => c.id === id)?.nome ?? "" : "");
  const eventos: EventoLinha[] = base.atividades
    .filter((a) => a.respId === pessoaId && a.status === "concluida" && dentro(a.concluida, p.ini, p.fim))
    .map((a) => ({ quando: a.concluida!, texto: `Concluiu "${a.titulo}"${a.clienteId ? ` · ${nomeCli(a.clienteId)}` : ""}`, href: `/admin/activities/${a.id}` }));
  const extras = { mensagens: 0, comentarios: 0, horas: 0 };
  if (r?.profileId) {
    const [aud, com, jobs, hrs] = await Promise.all([
      db.from("auditoria").select("quando, tabela, acao, resumo, registro_id, campos").eq("profile_id", r.profileId).gte("quando", p.ini).lt("quando", p.fim).order("quando", { ascending: false }).limit(80),
      db.from("activity_comments").select("created_at, activity_id, texto").eq("autor_id", r.profileId).gte("created_at", p.ini).lt("created_at", p.fim).limit(80),
      db.from("wa_jobs").select("id", { count: "exact", head: true }).eq("criado_por", r.profileId).gte("created_at", p.ini).lt("created_at", p.fim),
      db.from("time_entries").select("hours").eq("advogado_id", r.profileId).gte("date", p.ini.slice(0, 10)).lte("date", p.fim.slice(0, 10)),
    ]);
    for (const a of aud.data ?? []) {
      if (a.tabela === "activities" && a.acao === "editou" && (a.campos as string[] | null)?.every((c) => ["status", "concluida_em"].includes(c))) continue; // já aparece como "Concluiu"
      eventos.push({
        quando: a.quando,
        texto: `${a.acao === "criou" ? "Criou" : a.acao === "editou" ? "Editou" : "Excluiu"} ${TABELA[a.tabela] ?? a.tabela}${a.resumo ? ` "${a.resumo}"` : ""}`,
        href: a.tabela === "activities" && a.acao !== "excluiu" ? `/admin/activities/${a.registro_id}` : undefined,
      });
    }
    const titulo = new Map(base.atividades.map((a) => [a.id, a.titulo]));
    for (const c of com.data ?? []) eventos.push({ quando: c.created_at, texto: `Comentou em "${titulo.get(c.activity_id) ?? "atividade"}": ${String(c.texto).slice(0, 80)}`, href: `/admin/activities/${c.activity_id}` });
    extras.comentarios = com.data?.length ?? 0;
    extras.mensagens = jobs.count ?? 0;
    extras.horas = Math.round((hrs.data ?? []).reduce((s, x) => s + Number(x.hours), 0) * 10) / 10;
  }
  return { eventos: eventos.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 60), extras };
}

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ p?: string; aba?: string; pessoa?: string }> }) {
  const perfil = await exigirSuperAdmin();
  const sp = await searchParams;
  const aba = ABAS.some((a) => a.id === sp.aba) ? sp.aba! : "resumo";
  const periodo = periodoDe(sp.p);
  const [m, base] = await Promise.all([calcularMetricas(periodo), carregarBase()]);
  const ficha = aba === "responsaveis" && sp.pessoa ? await linhaDoTempo(sp.pessoa, periodo, base) : null;
  const equipeIds = base.responsaveis.filter((r) => r.profileId && m.equipe.some((e) => e.id === r.profileId)).map((r) => r.id);
  const a = m.atividades;
  const d = m.distribuicao;
  const w = m.atendimento;
  const tomSaude = m.saude >= 75 ? "text-status-success" : m.saude >= 50 ? "text-status-pending" : "text-status-danger";
  const COMPONENTES: { chave: keyof typeof m.componentes; rotulo: string; max: number }[] = [
    { chave: "prazo", rotulo: "Entregas no prazo", max: 25 },
    { chave: "resposta", rotulo: "Rapidez no WhatsApp", max: 20 },
    { chave: "satisfacao", rotulo: "Satisfação dos clientes", max: 20 },
    { chave: "atrasos", rotulo: "Poucas atrasadas", max: 15 },
    { chave: "distribuicao", rotulo: "Distribuição em dia", max: 10 },
    { chave: "sistema", rotulo: "Robôs funcionando", max: 10 },
  ];
  const horaAgora = Number(new Date().toLocaleString("en-US", { timeZone: "America/Bahia", hour: "2-digit", hour12: false })) % 24;
  const link = (q: { p?: string; aba?: string }) => {
    const u = new URLSearchParams();
    const pp = q.p ?? periodo.id;
    const aa = q.aba ?? aba;
    if (pp !== "mes") u.set("p", pp);
    if (aa !== "resumo") u.set("aba", aa);
    if (!q.aba && sp.pessoa && aa === "responsaveis") u.set("pessoa", sp.pessoa);
    const s = u.toString();
    return `/admin/painel${s ? `?${s}` : ""}`;
  };
  const primeiroNome = perfil.full_name.split(" ")[0] === "Suporte" ? "João" : perfil.full_name.split(" ")[0];

  return (
    <PainelBase atividades={base.atividades} clientes={base.clientes} responsaveis={base.responsaveis} periodoPagina={periodo.id}>
      <div className="pb-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-2">Gestão · Só admin máximo</p>
            <h1 className="page-title">Painel do Dono</h1>
          </div>
          <div className="inline-flex flex-wrap rounded-full border border-border bg-surface p-0.5 text-xs" role="tablist" aria-label="Período da página">
            {PERIODOS.map((x) => (
              <Link
                key={x.id}
                href={link({ p: x.id })}
                role="tab"
                aria-selected={periodo.id === x.id}
                className={`rounded-full px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${periodo.id === x.id ? "bg-navy text-white" : "text-foreground/60 hover:text-foreground"}`}
              >
                {x.rotulo}
              </Link>
            ))}
          </div>
        </div>

        <GerentePainel periodoId={periodo.id} nome={primeiroNome} />

        <nav className="sticky top-0 z-10 -mx-1 mt-6 mb-6 overflow-x-auto border-b border-border bg-background/90 px-1 backdrop-blur" aria-label="Abas do painel">
          <ul className="flex min-w-max gap-1">
            {ABAS.map((x) => (
              <li key={x.id}>
                <Link
                  href={link({ aba: x.id })}
                  aria-current={aba === x.id ? "page" : undefined}
                  className={`relative block px-3 py-3 text-sm font-medium transition-colors ${aba === x.id ? "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gold" : "text-muted hover:text-foreground"}`}
                >
                  {x.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {aba === "resumo" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
              <div className="ui-card p-5">
                <p className="text-sm font-semibold text-foreground">Saúde do escritório</p>
                <p className={`numero-grande mt-2 text-[3.5rem] leading-none ${tomSaude}`}>
                  {m.saude}
                  <span className="text-xl text-muted">/100</span>
                </p>
                <ul className="mt-4 space-y-2.5">
                  {COMPONENTES.map((c) => (
                    <li key={c.chave}>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted">{c.rotulo}</span>
                        <span className="tabular-nums text-foreground">
                          {m.componentes[c.chave]}/{c.max}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-navy dark:bg-[#3a6ea5]" style={{ width: `${(m.componentes[c.chave] / c.max) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 content-start gap-3 md:grid-cols-3">
                <StatCard label="Criadas" value={num(a.criadas)} hint={variacao(a.criadas, a.criadasAnt)} />
                <StatCard label="Concluídas" value={num(a.concluidas)} hint={variacao(a.concluidas, a.concluidasAnt)} tone="success" />
                <StatCard label="Abertas agora" value={num(a.abertas)} href="/admin/activities" />
                <StatCard label="Atrasadas" value={num(a.atrasadas)} tone={a.atrasadas ? "danger" : "default"} />
                <StatCard label="No prazo" value={num(a.noPrazoPct, "%")} hint="das concluídas" tone={a.noPrazoPct !== null && a.noPrazoPct < 80 ? "pending" : "default"} />
                <StatCard label="Pedido → entrega" value={a.tempoMedioDias === null ? "—" : `${a.tempoMedioDias.toLocaleString("pt-BR")} d`} hint={a.tempoMedianoDias === null ? undefined : `mediana ${a.tempoMedianoDias.toLocaleString("pt-BR")} d`} />
                <StatCard label="Resposta no Zap" value={horas(w.respostaMedianaHoras)} hint="mediana" tone={w.respostaMedianaHoras !== null && w.respostaMedianaHoras > 4 ? "pending" : "default"} />
                <StatCard label="Na Distribuição" value={num(d.pendentesAgora)} hint={`${d.pendentesHaMaisDe2Dias} há +2 dias`} tone={d.pendentesHaMaisDe2Dias ? "danger" : "default"} href="/admin/distribuicao" />
                <StatCard label="Satisfação" value={m.satisfacao.media === null ? "—" : `${m.satisfacao.media.toLocaleString("pt-BR")} / 5`} hint="pelo tempo de atendimento" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <QuadroCriadasConcluidas />
              <QuadroPorTipo />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <QuadroAbertasAntigas />
              <QuadroCarga equipe={equipeIds} />
            </div>
          </div>
        )}

        {aba === "responsaveis" &&
          (ficha && sp.pessoa ? (
            <FichaPessoa pessoaId={sp.pessoa} linhaDoTempo={ficha.eventos} extras={ficha.extras} />
          ) : (
            <div className="space-y-4">
              <CartoesResponsaveis equipe={equipeIds} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <QuadroCarga equipe={equipeIds} />
                <Lista
                  titulo="Quem mais respondeu clientes no WhatsApp"
                  vazio="Nenhuma resposta pelo portal no período."
                  itens={[
                    ...w.respostasPorPessoa.map((r) => ({ chave: r.nome, texto: r.nome, valor: num(r.n) })),
                    ...(w.respostasCelular ? [{ chave: "_cel", texto: <span className="text-muted">Pelo celular (direto no WhatsApp)</span>, valor: num(w.respostasCelular) }] : []),
                    ...(w.respostasIa ? [{ chave: "_ia", texto: <span className="text-muted">Agente MC (IA)</span>, valor: num(w.respostasIa) }] : []),
                  ]}
                />
              </div>
              <Bloco titulo="Tudo o que cada um fez" apoio={`${periodo.rotulo} · ações contam desde 24/10, quando a auditoria começou`}>
                <div className="overflow-x-auto ui-card">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Pessoa</th>
                        {["Concluídas", "No prazo", "Abertas", "Atrasadas", "Tempo médio", "Envolvido", "Msgs", "Comentários", "Publicações", "Atas", "Transcrições", "Horas", "Ações"].map((h) => (
                          <th key={h} className="px-3 py-2.5 text-right font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {m.equipe.map((e) => {
                        const rid = base.responsaveis.find((r) => r.profileId === e.id)?.id;
                        return (
                          <tr key={e.id}>
                            <td className="px-4 py-2.5 whitespace-nowrap text-foreground">
                              {rid ? (
                                <Link href={`/admin/painel?aba=responsaveis&pessoa=${rid}${periodo.id !== "mes" ? `&p=${periodo.id}` : ""}`} className="hover:underline">
                                  {e.nome}
                                </Link>
                              ) : (
                                e.nome
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right font-medium">{e.concluidas}</td>
                            <td className="px-3 py-2.5 text-right">{e.concluidas ? `${Math.round((e.noPrazo / e.concluidas) * 100)}%` : "—"}</td>
                            <td className="px-3 py-2.5 text-right">{e.abertas}</td>
                            <td className={`px-3 py-2.5 text-right ${e.atrasadas ? "text-status-danger" : ""}`}>{e.atrasadas}</td>
                            <td className="px-3 py-2.5 text-right">{e.tempoMedioDias === null ? "—" : `${e.tempoMedioDias.toLocaleString("pt-BR")} d`}</td>
                            <td className="px-3 py-2.5 text-right">{e.envolvido}</td>
                            <td className="px-3 py-2.5 text-right">{e.mensagens}</td>
                            <td className="px-3 py-2.5 text-right">{e.comentarios}</td>
                            <td className="px-3 py-2.5 text-right">{e.publicacoes}</td>
                            <td className="px-3 py-2.5 text-right">{e.atas}</td>
                            <td className="px-3 py-2.5 text-right">{e.transcricoes}</td>
                            <td className="px-3 py-2.5 text-right">{e.horas?.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-2.5 text-right">{e.acoes}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Bloco>
            </div>
          ))}

        {aba === "clientes" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">Satisfação calculada pelo tempo entre o pedido e a entrega (≤1 dia = 5 · ≤3 = 4,5 · ≤7 = 4 · ≤15 = 3 · ≤30 = 2 · mais = 1; −0,5 se passou do prazo; últimos 90 dias).</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Satisfação média" value={m.satisfacao.media === null ? "—" : `${m.satisfacao.media.toLocaleString("pt-BR")} / 5`} hint={`${m.satisfacao.avaliadas} atividades avaliadas`} tone={m.satisfacao.media !== null && m.satisfacao.media < 3.5 ? "pending" : "success"} />
              <StatCard label="Clientes ativos" value={num(m.comercial.clientesAtivos)} href="/admin/clients" />
              <StatCard label="Clientes novos" value={num(m.comercial.clientesNovos)} />
              <StatCard label="Leads novos" value={num(m.comercial.leadsNovos)} />
              <StatCard label="Relatórios feitos" value={num(m.clientes.relatoriosNoPeriodo)} hint={`${m.clientes.relatoriosEnviados} enviados ao cliente`} href="/admin/reports" />
              <StatCard label="Esfriando" value={num(m.clientes.esfriando.length)} tone={m.clientes.esfriando.length ? "pending" : "default"} hint="empresas com risco" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Lista titulo="Menos satisfeitos" vazio="Sem dados suficientes ainda." itens={m.satisfacao.menos.map((c) => ({ chave: c.id, href: `/admin/clients/${c.id}`, texto: c.nome, valor: `${c.nota.toLocaleString("pt-BR")} · ${c.atividades} ativ.`, tom: c.nota < 3 ? "danger" : "pending" }))} />
              <Lista titulo="Mais satisfeitos" vazio="Nenhum cliente com nota 4 ou mais ainda." itens={m.satisfacao.mais.map((c) => ({ chave: c.id, href: `/admin/clients/${c.id}`, texto: c.nome, valor: `${c.nota.toLocaleString("pt-BR")} · ${c.atividades} ativ.`, tom: "success" }))} />
              <Lista titulo="Quem mais manda demandas" vazio="Nenhuma demanda no período." itens={m.clientes.maisDemandas.map((c) => ({ chave: c.id, href: `/admin/clients/${c.id}`, texto: c.nome, valor: num(c.demandas) }))} />
              <Lista
                titulo="Pouco ativos (30+ dias sem contato)"
                vazio="Todos os clientes tiveram contato recente."
                itens={m.clientes.poucoAtivos.map((c) => ({ chave: c.id, href: `/admin/clients/${c.id}`, texto: c.pf ? <>{c.nome} <span className="text-muted">· PF</span></> : c.nome, valor: c.dias === null ? "nunca" : `${c.dias} dias`, tom: c.dias === null || c.dias > 60 ? "danger" : "pending" }))}
              />
            </div>
            <Lista
              titulo="Empresas com risco de perder (sem contato + satisfação + inadimplência)"
              vazio="Nenhuma empresa em risco."
              itens={m.clientes.esfriando.map((c) => ({
                chave: c.id,
                href: `/admin/clients/${c.id}`,
                texto: (
                  <>
                    {c.nome} <span className="text-muted">· {c.semContatoDias} dias sem contato · nota {c.nota?.toLocaleString("pt-BR")}{c.inadimplente ? " · inadimplente" : ""}</span>
                  </>
                ),
                valor: `risco ${c.risco}`,
                tom: c.risco >= 70 ? "danger" : "pending",
              }))}
            />
          </div>
        )}

        {aba === "distribuicao" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Chegaram" value={num(d.chegaram)} />
              <StatCard label="Aprovadas" value={num(d.aceitas)} tone="success" hint={d.aceitas ? `${d.aceitasFeitas} já concluídas` : undefined} />
              <StatCard label="Descartadas" value={num(d.descartadas)} tone={d.descartadas ? "danger" : "default"} />
              <StatCard label="Pendentes agora" value={num(d.pendentesAgora)} tone={d.pendentesAgora ? "pending" : "default"} href="/admin/distribuicao" />
              <StatCard label="Paradas +2 dias" value={num(d.pendentesHaMaisDe2Dias)} tone={d.pendentesHaMaisDe2Dias ? "danger" : "default"} />
              <StatCard label="Tempo até decidir" value={horas(d.tempoAteTratarHoras)} hint="mediana" />
            </div>
            <div className="ui-card p-5">
              <p className="mb-3 text-sm font-semibold text-foreground">Por origem</p>
              <BarraSituacao linhas={d.porOrigem.map((o) => ({ rotulo: ORIGEM[o.origem] ?? o.origem, ...o }))} />
            </div>
          </div>
        )}

        {aba === "whatsapp" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Resposta (mediana)" value={horas(w.respostaMedianaHoras)} tone={w.respostaMedianaHoras !== null && w.respostaMedianaHoras > 4 ? "pending" : "default"} />
              <StatCard label="Resposta (média)" value={horas(w.respostaMediaHoras)} hint={w.respostaPiorHoras === null ? undefined : `pior: ${horas(w.respostaPiorHoras)}`} />
              <StatCard label="Recebidas" value={num(w.recebidas)} />
              <StatCard label="Enviadas" value={num(w.enviadas)} />
              <StatCard label="Pela IA" value={num(w.respostasIa)} hint="Agente MC" />
              <StatCard label="Esperando +2 h" value={num(w.esperandoAgora.length)} tone={w.esperandoAgora.length ? "danger" : "default"} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="ui-card min-w-0 p-5 lg:col-span-2">
                <p className="mb-3 text-sm font-semibold text-foreground">Mensagens recebidas por hora do dia</p>
                <Barras dados={w.porHora.map((v, h) => ({ rotulo: `${h}h`, valor: v }))} destaque={horaAgora} />
              </div>
              <Lista
                titulo="Quem mais respondeu"
                vazio="Nenhuma resposta pelo portal."
                itens={[
                  ...w.respostasPorPessoa.map((r) => ({ chave: r.nome, texto: r.nome, valor: num(r.n) })),
                  ...(w.respostasCelular ? [{ chave: "_celular", texto: <span className="text-muted">Pelo celular (direto no WhatsApp)</span>, valor: num(w.respostasCelular) }] : []),
                ]}
              />
            </div>
            <Lista titulo="Clientes esperando resposta agora" vazio="Ninguém esperando há mais de 2 horas." itens={w.esperandoAgora.map((e) => ({ chave: e.conversa, texto: e.cliente ?? e.conversa, valor: `${e.horas} h`, tom: e.horas > 24 ? "danger" : "pending", href: "/admin/whatsapp" }))} />
          </div>
        )}

        {aba === "financeiro" && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Faturado no período" value={reais(m.financas.faturado)} href="/admin/financial" />
            <StatCard label="Recebido no período" value={reais(m.financas.recebido)} tone="success" />
            <StatCard label="A receber" value={reais(m.financas.aReceber)} />
            <StatCard label="Inadimplente" value={reais(m.financas.inadimplente)} tone={m.financas.inadimplente ? "danger" : "default"} hint={`${m.financas.clientesInadimplentes} clientes`} />
          </div>
        )}

        {aba === "sistema" && (
          <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="ui-card p-5">
                <p className="eyebrow">Agente MC (WhatsApp)</p>
                <p className={`mt-2 text-sm font-medium ${m.sistema.agenteNoAr ? "text-status-success" : "text-status-danger"}`}>{m.sistema.agenteNoAr ? "● No ar" : "● Fora do ar"}</p>
              </div>
              <div className="ui-card p-5">
                <p className="eyebrow">Robô de publicações</p>
                <p className={`mt-2 text-sm font-medium ${m.sistema.publicacoes?.erro ? "text-status-danger" : "text-status-success"}`}>{m.sistema.publicacoes ? (m.sistema.publicacoes.erro ? "● Erro na última rodada" : "● OK") : "—"}</p>
                {m.sistema.publicacoes && <p className="mt-1 text-xs text-muted">última: {quando(m.sistema.publicacoes.quando)}</p>}
              </div>
              <div className="ui-card p-5">
                <p className="eyebrow">Andamentos do Astrea</p>
                <p className={`mt-2 text-sm font-medium ${m.sistema.andamentos?.erro ? "text-status-danger" : "text-status-success"}`}>{m.sistema.andamentos ? (m.sistema.andamentos.erro ? "● Erro na última rodada" : "● OK") : "—"}</p>
                {m.sistema.andamentos && <p className="mt-1 text-xs text-muted">última: {quando(m.sistema.andamentos.quando)}</p>}
              </div>
            </div>
            <Bloco titulo="Quem fez o quê" apoio="Últimas ações no sistema (criou, editou, excluiu). Robôs aparecem como Sistema. As conversas com a IA não são registradas.">
              <div className="overflow-x-auto ui-card">
                {m.auditoria.length === 0 ? (
                  <p className="p-5 text-sm text-muted">A auditoria começou em 24/10 — as próximas ações aparecem aqui.</p>
                ) : (
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Quando</th>
                        <th className="px-4 py-2.5 font-medium">Pessoa</th>
                        <th className="px-4 py-2.5 font-medium">O quê</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {m.auditoria.map((x, k) => (
                        <tr key={k}>
                          <td className="px-4 py-2 whitespace-nowrap text-muted tabular-nums">{quando(x.quando)}</td>
                          <td className="px-4 py-2 whitespace-nowrap text-foreground">{x.pessoa}</td>
                          <td className="px-4 py-2 text-foreground">
                            {x.acao} {TABELA[x.tabela] ?? x.tabela}
                            {x.resumo ? <span className="text-muted"> · {x.resumo}</span> : null}
                            {x.acao === "editou" && x.campos?.length ? <span className="text-muted"> ({x.campos.slice(0, 4).join(", ")}{x.campos.length > 4 ? "…" : ""})</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Bloco>
          </div>
        )}
      </div>
    </PainelBase>
  );
}
