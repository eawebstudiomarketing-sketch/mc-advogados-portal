import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirSuperAdmin } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularMetricas } from "@/lib/painel/metricas";
import { carregarBase } from "@/lib/painel/dados";
import { PERIODOS, dentro, dias as diasEntre, media, notaPorTempo, noPrazo, periodoDe, type Periodo } from "@/lib/painel/base";
import { StatCard } from "@/components/ui/stat-card";
import { Barras, BarrasH, LinhaCriadasConcluidas } from "@/components/painel/graficos";
import { AtividadesDoCliente, MapaCalorClientes, QuadroAgenda, QuadroCargaSemana, QuadroDistChegadas, QuadroDistDecisoes, QuadroDistParados, QuadroVencidas } from "@/components/painel/quadros2";
import { dadosComercial, dadosFinanceiro, dadosProcessos, fichaCliente, linhasDistribuicao, ultimosMeses } from "@/lib/painel/extras";
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
  { id: "prazos", rotulo: "Prazos e Agenda" },
  { id: "processos", rotulo: "Processos e Publicações" },
  { id: "distribuicao", rotulo: "Distribuição" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "comercial", rotulo: "Comercial" },
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

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ p?: string; aba?: string; pessoa?: string; cliente?: string }> }) {
  const perfil = await exigirSuperAdmin();
  const sp = await searchParams;
  const aba = ABAS.some((a) => a.id === sp.aba) ? sp.aba! : "resumo";
  const periodo = periodoDe(sp.p);
  const [m, base] = await Promise.all([calcularMetricas(periodo), carregarBase()]);
  const [ficha, dist, fichaCli, proc, com, fin] = await Promise.all([
    aba === "responsaveis" && sp.pessoa ? linhaDoTempo(sp.pessoa, periodo, base) : null,
    aba === "distribuicao" || (aba === "clientes" && !sp.cliente) ? linhasDistribuicao() : [],
    aba === "clientes" && sp.cliente ? fichaCliente(sp.cliente) : null,
    aba === "processos" ? dadosProcessos(periodo) : null,
    aba === "comercial" ? dadosComercial(periodo) : null,
    aba === "financeiro" ? dadosFinanceiro() : null,
  ]);
  const fichaHref = (id: string) => `/admin/painel?aba=clientes&cliente=${id}${periodo.id !== "mes" ? `&p=${periodo.id}` : ""}`;
  // ficha do cliente: quem cuida e satisfação (pelo tempo de atendimento, 90 dias)
  const doCliente = fichaCli ? base.atividades.filter((x) => x.clienteId === fichaCli.cliente.id) : [];
  const cuidam = [...new Set(doCliente.filter((x) => x.status === "aberta" || x.status === "em_andamento").map((x) => base.responsaveis.find((r) => r.id === x.respId)?.nome).filter((x): x is string => !!x))];
  const agoraIso = periodoDe("hoje").fim;
  const notasCli = doCliente
    .filter((x) => x.status === "concluida" && x.concluida && diasEntre(x.concluida, agoraIso) <= 90)
    .map((x) => notaPorTempo(diasEntre(x.pedido, x.concluida!), !noPrazo(x)));
  const satisfCli = notasCli.length ? Math.round(media(notasCli)! * 10) / 10 : null;
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
    if (!q.aba && sp.cliente && aa === "clientes") u.set("cliente", sp.cliente);
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

        {aba === "clientes" &&
          (fichaCli ? (
            <div className="space-y-4">
              <Link href={link({ aba: "clientes" })} className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-foreground">
                ‹ Clientes
              </Link>
              <div className="ui-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="eyebrow mb-1">{fichaCli.cliente.pf ? "Pessoa física" : "Empresa"} · cliente desde {new Date(fichaCli.cliente.desde).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" })}</p>
                    <h2 className="text-xl font-semibold text-foreground">{fichaCli.cliente.nome}</h2>
                    <p className="mt-1 text-sm text-muted">Cuidam deste cliente: {cuidam.length ? cuidam.join(", ") : "ninguém com atividade aberta"}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/admin/clients/${fichaCli.cliente.id}`} className="ui-btn-secondary px-3 py-1.5 text-xs">
                      Abrir cadastro
                    </Link>
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4 lg:grid-cols-7">
                  {[
                    { r: "satisfação", v: satisfCli === null ? "—" : `${satisfCli.toLocaleString("pt-BR")} / 5` },
                    { r: "abertas", v: String(base.atividades.filter((x) => x.clienteId === fichaCli.cliente.id && (x.status === "aberta" || x.status === "em_andamento")).length) },
                    { r: "processos", v: String(fichaCli.processos.length) },
                    { r: "última msg do cliente", v: fichaCli.whatsapp.ultimaDeles ? quando(fichaCli.whatsapp.ultimaDeles) : "—" },
                    { r: "nossa última resposta", v: fichaCli.whatsapp.ultimaNossa ? quando(fichaCli.whatsapp.ultimaNossa) : "—" },
                    { r: "a receber", v: reais(fichaCli.financeiro.aReceber) },
                    { r: "em atraso", v: reais(fichaCli.financeiro.atrasado) },
                  ].map((x) => (
                    <div key={x.r}>
                      <p className="text-base font-semibold tabular-nums text-foreground">{x.v}</p>
                      <p className="text-[11px] text-muted">{x.r}</p>
                    </div>
                  ))}
                </div>
                {fichaCli.whatsapp.esperando && <p className="mt-4 rounded-lg bg-status-danger-bg px-3 py-2 text-sm text-status-danger">A última mensagem no WhatsApp é do cliente e ainda não foi respondida.</p>}
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <AtividadesDoCliente clienteId={fichaCli.cliente.id} />
                <div className="space-y-4">
                  <Lista
                    titulo="Processos"
                    vazio="Nenhum processo cadastrado."
                    itens={fichaCli.processos.slice(0, 10).map((x) => ({ chave: x.id, href: `/admin/processes/${x.id}`, texto: <>{x.numero ?? "sem número"} <span className="text-muted">· {x.titulo ?? x.area ?? ""}</span></>, valor: x.ultimo ? new Date(x.ultimo).toLocaleDateString("pt-BR") : "—" }))}
                  />
                  <Lista
                    titulo="Pedidos na Distribuição"
                    vazio="Nada passou pela Distribuição."
                    itens={fichaCli.distribuicao.map((x, k) => ({ chave: String(k), texto: <>{x.titulo} <span className="text-muted">· {ORIGEM[x.origem] ?? x.origem}</span></>, valor: x.status === "aceita" ? "aprovado" : x.status === "descartada" ? "descartado" : "pendente", tom: x.status === "aceita" ? "success" : x.status === "descartada" ? "danger" : "pending" }))}
                  />
                  <Lista titulo="Relatórios mensais" vazio="Nenhum relatório gerado." itens={fichaCli.relatorios.map((x) => ({ chave: x.ref, texto: x.ref, valor: x.enviado ? "enviado" : "não enviado", tom: x.enviado ? "success" : "pending" }))} />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted">Satisfação calculada pelo tempo entre o pedido e a entrega (≤1 dia = 5 · ≤3 = 4,5 · ≤7 = 4 · ≤15 = 3 · ≤30 = 2 · mais = 1; −0,5 se passou do prazo; últimos 90 dias).</p>
                <form method="get" action="/admin/painel" className="flex items-center gap-1.5">
                  <input type="hidden" name="aba" value="clientes" />
                  {periodo.id !== "mes" && <input type="hidden" name="p" value={periodo.id} />}
                  <select name="cliente" aria-label="Abrir ficha do cliente" className="ui-input !w-auto max-w-[14rem] !py-1.5 text-xs" defaultValue="" required>
                    <option value="" disabled>
                      Abrir ficha de um cliente…
                    </option>
                    {base.clientes
                      .filter((c) => c.ativo)
                      .sort((a, b) => a.nome.localeCompare(b.nome))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                          {c.pf ? " (PF)" : ""}
                        </option>
                      ))}
                  </select>
                  <button type="submit" className="ui-btn px-3 py-1.5 text-xs">
                    Abrir
                  </button>
                </form>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Satisfação média" value={m.satisfacao.media === null ? "—" : `${m.satisfacao.media.toLocaleString("pt-BR")} / 5`} hint={`${m.satisfacao.avaliadas} atividades avaliadas`} tone={m.satisfacao.media !== null && m.satisfacao.media < 3.5 ? "pending" : "success"} />
                <StatCard label="Empresas ativas" value={num(base.clientes.filter((c) => c.ativo && !c.pf).length)} />
                <StatCard label="Pessoas físicas ativas" value={num(base.clientes.filter((c) => c.ativo && c.pf).length)} />
                <StatCard label="Clientes novos" value={num(m.comercial.clientesNovos)} hint={periodo.rotulo.toLowerCase()} />
                <StatCard label="Relatórios feitos" value={num(m.clientes.relatoriosNoPeriodo)} hint={`${m.clientes.relatoriosEnviados} enviados ao cliente`} href="/admin/reports" />
                <StatCard label="Esfriando" value={num(m.clientes.esfriando.length)} tone={m.clientes.esfriando.length ? "pending" : "default"} hint="empresas com risco" />
              </div>
              <MapaCalorClientes dist={dist} meses={ultimosMeses(6)} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Lista titulo="Menos satisfeitos" vazio="Sem dados suficientes ainda." itens={m.satisfacao.menos.map((c) => ({ chave: c.id, href: fichaHref(c.id), texto: c.nome, valor: `${c.nota.toLocaleString("pt-BR")} · ${c.atividades} ativ.`, tom: c.nota < 3 ? "danger" : "pending" }))} />
                <Lista titulo="Mais satisfeitos" vazio="Nenhum cliente com nota 4 ou mais ainda." itens={m.satisfacao.mais.map((c) => ({ chave: c.id, href: fichaHref(c.id), texto: c.nome, valor: `${c.nota.toLocaleString("pt-BR")} · ${c.atividades} ativ.`, tom: "success" }))} />
                <Lista titulo="Quem mais manda demandas" vazio="Nenhuma demanda no período." itens={m.clientes.maisDemandas.map((c) => ({ chave: c.id, href: fichaHref(c.id), texto: c.nome, valor: num(c.demandas) }))} />
                <Lista
                  titulo="Pouco ativos (30+ dias sem contato)"
                  vazio="Todos os clientes tiveram contato recente."
                  itens={m.clientes.poucoAtivos.map((c) => ({ chave: c.id, href: fichaHref(c.id), texto: c.pf ? <>{c.nome} <span className="text-muted">· PF</span></> : c.nome, valor: c.dias === null ? "nunca" : `${c.dias} dias`, tom: c.dias === null || c.dias > 60 ? "danger" : "pending" }))}
                />
              </div>
              <Lista
                titulo="Empresas com risco de perder (sem contato + satisfação + inadimplência)"
                vazio="Nenhuma empresa em risco."
                itens={m.clientes.esfriando.map((c) => ({
                  chave: c.id,
                  href: fichaHref(c.id),
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
          ))}

        {aba === "distribuicao" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Chegaram" value={num(d.chegaram)} hint={periodo.rotulo.toLowerCase()} />
              <StatCard label="Aprovadas" value={num(d.aceitas)} tone="success" hint={d.aceitas ? `${d.aceitasFeitas} já concluídas` : undefined} />
              <StatCard label="Descartadas" value={num(d.descartadas)} tone={d.descartadas ? "danger" : "default"} />
              <StatCard label="Pendentes agora" value={num(d.pendentesAgora)} tone={d.pendentesAgora ? "pending" : "default"} href="/admin/distribuicao" />
              <StatCard label="Paradas +2 dias" value={num(d.pendentesHaMaisDe2Dias)} tone={d.pendentesHaMaisDe2Dias ? "danger" : "default"} />
              <StatCard label="Tempo até decidir" value={horas(d.tempoAteTratarHoras)} hint="mediana" />
            </div>
            <QuadroDistChegadas dist={dist} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <QuadroDistDecisoes dist={dist} />
              <QuadroDistParados dist={dist} />
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
            <div className="ui-card min-w-0 p-5">
              <p className="text-sm font-semibold text-foreground">Recebidas × enviadas por dia</p>
              <p className="mb-4 mt-0.5 text-xs text-muted">{periodo.rotulo}</p>
              {w.porDia.length > 1 ? <LinhaCriadasConcluidas serie={w.porDia.map((x) => ({ dia: x.dia, criadas: x.recebidas, concluidas: x.enviadas }))} rotulos={["Recebidas", "Enviadas"]} /> : <p className="text-sm text-muted">Escolha um período maior que um dia para ver a evolução.</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="ui-card min-w-0 p-5">
                <p className="mb-3 text-sm font-semibold text-foreground">Tempo de resposta por pessoa</p>
                {w.tempoPorPessoa.length === 0 ? (
                  <p className="text-sm text-muted">Nenhuma resposta a cliente no período.</p>
                ) : (
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th className="py-2 pr-2 font-medium">Quem respondeu</th>
                        <th className="px-2 py-2 text-right font-medium">Respostas</th>
                        <th className="py-2 pl-2 text-right font-medium">Tempo (mediana)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border tabular-nums">
                      {w.tempoPorPessoa.map((x) => (
                        <tr key={x.nome}>
                          <td className="py-2 pr-2 text-foreground">{x.nome}</td>
                          <td className="px-2 py-2 text-right">{x.respondidas}</td>
                          <td className={`py-2 pl-2 text-right ${x.medianaHoras !== null && x.medianaHoras > 4 ? "text-status-pending" : ""}`}>{horas(x.medianaHoras)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="mt-3 text-[11px] text-muted">&quot;Pelo celular&quot; = respondido direto no WhatsApp do aparelho, sem passar pelo portal.</p>
              </div>
              <div className="ui-card min-w-0 p-5">
                <p className="mb-3 text-sm font-semibold text-foreground">Mensagens recebidas por hora do dia</p>
                <Barras dados={w.porHora.map((v, h) => ({ rotulo: `${h}h`, valor: v }))} destaque={horaAgora} />
              </div>
            </div>
            <Lista titulo="Clientes esperando resposta agora" vazio="Ninguém esperando há mais de 2 horas." itens={w.esperandoAgora.map((e) => ({ chave: e.conversa, texto: e.cliente ?? e.conversa, valor: `${e.horas} h`, tom: e.horas > 24 ? "danger" : "pending", href: "/admin/whatsapp" }))} />
          </div>
        )}

        {aba === "prazos" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <QuadroAgenda />
              <QuadroVencidas />
            </div>
            <QuadroCargaSemana equipe={equipeIds} />
          </div>
        )}

        {aba === "processos" && proc && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Processos ativos" value={num(proc.ativos)} href="/admin/processes" />
              <StatCard label="Andamentos no período" value={num(proc.andamentosNoPeriodo)} />
              <StatCard label="Andamentos sem tratar" value={num(proc.andamentosNovosSemTratar)} tone={proc.andamentosNovosSemTratar ? "pending" : "default"} />
              <StatCard label="Publicações no período" value={num(proc.publicacoesNoPeriodo)} />
              <StatCard label="Publicações sem tratar" value={num(proc.publicacoesNaoTratadas)} tone={proc.publicacoesNaoTratadas ? "danger" : "default"} href="/admin/publicacoes" />
              <StatCard label="Tempo p/ tratar publicação" value={horas(proc.tempoTratarPublicacaoHoras)} hint="mediana" />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="ui-card min-w-0 p-5">
                <p className="mb-3 text-sm font-semibold text-foreground">Processos ativos por área</p>
                <BarrasH dados={proc.porArea} />
              </div>
              <div className="ui-card min-w-0 p-5">
                <p className="mb-3 text-sm font-semibold text-foreground">Publicações por tribunal ({periodo.rotulo.toLowerCase()})</p>
                {proc.porTribunal.length ? <BarrasH dados={proc.porTribunal} /> : <p className="text-sm text-muted">Nenhuma publicação no período.</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Lista titulo="Andamentos novos ainda não vistos" vazio="Nenhum andamento novo." itens={proc.ultimosAndamentos.map((x) => ({ chave: x.id, href: `/admin/processes/${x.processoId}`, texto: <>{x.descricao || "Andamento"} <span className="text-muted">· {x.cliente ?? x.numero}</span></>, valor: quando(x.quando) }))} />
              <Lista titulo="Publicações esperando tratamento" vazio="Todas as publicações foram tratadas." itens={proc.publicacoesParadas.map((x) => ({ chave: x.id, href: "/admin/publicacoes", texto: <>{x.tipo ?? "Publicação"} · {x.numero ?? ""} <span className="text-muted">· {x.cliente ?? x.tribunal ?? ""}</span></>, valor: `${x.dias} d`, tom: x.dias > 2 ? "danger" : "pending" }))} />
            </div>
            <Lista titulo="Processos parados (sem andamento há 90+ dias)" vazio="Nenhum processo parado." itens={proc.parados.map((x) => ({ chave: x.id, href: `/admin/processes/${x.id}`, texto: <>{x.numero ?? "sem número"} <span className="text-muted">· {x.cliente ?? x.titulo ?? ""}{x.resp ? ` · ${x.resp}` : ""}</span></>, valor: x.ultimo ? `último ${new Date(x.ultimo).toLocaleDateString("pt-BR")}` : "sem andamento", tom: "pending" }))} />
          </div>
        )}

        {aba === "comercial" && com && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Clientes novos" value={num(com.clientesNovos)} hint={`${com.clientesNovosPj} empresas · ${periodo.rotulo.toLowerCase()}`} />
              <StatCard label="Clientes ativos" value={num(com.clientesAtivos)} href="/admin/clients" />
              <StatCard label="Leads novos" value={num(com.leadsNovos)} />
              <StatCard label="Leads quentes" value={num(com.leadsQuentes)} tone={com.leadsQuentes ? "pending" : "default"} />
              <StatCard label="Contratos ativos" value={num(com.contratosAtivos)} hint={com.valorContratosAtivos ? reais(com.valorContratosAtivos) : undefined} />
              <StatCard label="Onboardings" value={num(com.onboardings)} hint="atas de onboarding" />
            </div>
            <div className="ui-card min-w-0 p-5">
              <p className="mb-3 text-sm font-semibold text-foreground">Clientes novos por mês (12 meses)</p>
              <Barras dados={com.novosPorMes} destaque={com.novosPorMes.length - 1} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="ui-card min-w-0 p-5">
                <p className="mb-3 text-sm font-semibold text-foreground">Leads por situação</p>
                {com.leadsPorStatus.length ? <BarrasH dados={com.leadsPorStatus} /> : <p className="text-sm text-muted">Nenhum lead cadastrado ainda. Eles aparecem aqui quando o Agente MC ou a equipe registrar.</p>}
              </div>
              <div className="ui-card min-w-0 p-5">
                <p className="mb-3 text-sm font-semibold text-foreground">De onde vieram ({periodo.rotulo.toLowerCase()})</p>
                {com.leadsPorOrigem.length ? <BarrasH dados={com.leadsPorOrigem} /> : <p className="text-sm text-muted">Nenhum lead no período.</p>}
              </div>
              <Lista titulo="Contratos novos" vazio="Nenhum contrato cadastrado no período." itens={com.contratosNovos.map((x) => ({ chave: x.id, texto: <>{x.titulo} <span className="text-muted">· {x.cliente}</span></>, valor: x.valor ? reais(x.valor) : "—" }))} />
            </div>
          </div>
        )}

        {aba === "financeiro" && fin && (
          <div className="space-y-4">
            {fin.vazio && <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted">Ainda não há lançamentos no Financeiro do portal. Os números aparecem aqui assim que os honorários forem lançados em Gestão › Financeiro.</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Faturado no período" value={reais(m.financas.faturado)} href="/admin/financial" />
              <StatCard label="Recebido no período" value={reais(m.financas.recebido)} tone="success" />
              <StatCard label="A receber" value={reais(m.financas.aReceber)} />
              <StatCard label="Inadimplente" value={reais(m.financas.inadimplente)} tone={m.financas.inadimplente ? "danger" : "default"} hint={`${m.financas.clientesInadimplentes} clientes`} />
            </div>
            <div className="ui-card min-w-0 p-5">
              <p className="mb-4 text-sm font-semibold text-foreground">Faturado × recebido por mês (12 meses)</p>
              <LinhaCriadasConcluidas serie={fin.porMes.map((x) => ({ dia: x.mes, criadas: x.faturado, concluidas: x.recebido }))} rotulos={["Faturado", "Recebido"]} formatar={(v) => reais(v)} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Lista titulo="Clientes que mais pagaram" vazio="Nenhum pagamento registrado." itens={fin.topClientes.map((x) => ({ chave: x.id, href: fichaHref(x.id), texto: x.nome, valor: reais(x.valor) }))} />
              <Lista titulo="Inadimplentes" vazio="Ninguém em atraso." itens={fin.inadimplentes.map((x) => ({ chave: x.id, href: fichaHref(x.id), texto: <>{x.nome} <span className="text-muted">· desde {x.desde.split("-").reverse().join("/")}</span></>, valor: reais(x.valor), tom: "danger" }))} />
            </div>
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
