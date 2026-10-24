import Link from "next/link";
import { exigirSuperAdmin } from "@/lib/dal";
import { calcularMetricas, periodoDe } from "@/lib/painel/metricas";
import { sugestoesDoDia } from "@/lib/painel/sugestao";
import { StatCard } from "@/components/ui/stat-card";
import { BarraSituacao, Barras, LinhaCriadasConcluidas } from "@/components/painel/graficos";
import { RefazerSugestoes } from "@/components/painel/refazer-sugestoes";

export const metadata = { title: "Painel do Dono" };
export const maxDuration = 60;

// Painel do Dono (24/10/2026): só o admin máximo (Maurício e João). Tudo
// calculado em código; a IA só escreve as sugestões do dia (1x, guardadas).
// Conversas do assistente de IA não são monitoradas (decisão do usuário).

const PERIODOS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "7 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "30d", rotulo: "30 dias" },
  { id: "mes-anterior", rotulo: "Mês passado" },
  { id: "ano", rotulo: "Este ano" },
];
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
const TIPO: Record<string, string> = { consultoria: "Consultoria", contrato: "Contrato", processo: "Processo", reuniao: "Reunião", parecer: "Parecer", outro: "Outro" };

const num = (v: number | null | undefined, suf = "") => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR")}${suf}`);
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const horas = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toLocaleString("pt-BR")} h` : `${Math.round(h / 24)} dias`);
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const variacao = (atual: number, antes: number) => (antes ? `${atual >= antes ? "+" : ""}${Math.round(((atual - antes) / antes) * 100)}% vs período anterior` : "sem base anterior");

function Secao({ titulo, descricao, children, id }: { titulo: string; descricao?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-10">
      <h2 className="section-title">{titulo}</h2>
      {descricao && <p className="mt-0.5 text-sm text-muted">{descricao}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Lista({ titulo, vazio, itens }: { titulo: string; vazio: string; itens: { chave: string; texto: React.ReactNode; valor: React.ReactNode; href?: string; tom?: "danger" | "pending" | "success" }[] }) {
  const cor = { danger: "text-status-danger", pending: "text-status-pending", success: "text-status-success" };
  return (
    <div className="ui-card min-w-0 p-5">
      <p className="eyebrow mb-2">{titulo}</p>
      {itens.length === 0 ? (
        <p className="py-3 text-sm text-muted">{vazio}</p>
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

export default async function PainelPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await exigirSuperAdmin();
  const { p } = await searchParams;
  const [m, sug] = await Promise.all([calcularMetricas(periodoDe(p)), sugestoesDoDia().catch(() => null)]);
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

  return (
    <div className="pb-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Gestão · Só admin máximo</p>
          <h1 className="page-title">Painel do Dono</h1>
          <p className="text-sm text-muted">Tudo o que aconteceu no escritório · {m.periodo.rotulo.toLowerCase()}</p>
        </div>
        <div className="inline-flex flex-wrap rounded-full border border-border bg-surface p-0.5 text-xs" role="tablist" aria-label="Período">
          {PERIODOS.map((x) => (
            <Link
              key={x.id}
              href={`/admin/painel?p=${x.id}`}
              role="tab"
              aria-selected={m.periodo.id === x.id}
              className={`rounded-full px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${m.periodo.id === x.id ? "bg-navy text-white" : "text-foreground/60 hover:text-foreground"}`}
            >
              {x.rotulo}
            </Link>
          ))}
        </div>
      </div>

      {/* saúde + sugestões */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="ui-card p-5">
          <p className="eyebrow">Saúde do escritório</p>
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
        <div className="ui-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Sugestões de hoje</p>
              <p className="mt-1 text-sm text-muted">
                {sug ? `${sug.resumo}` : "Saem todo dia às 7h (e vão para o WhatsApp do Maurício)."}
              </p>
            </div>
            <RefazerSugestoes temSugestao={!!sug} />
          </div>
          {sug ? (
            <ol className="mt-4 space-y-3">
              {sug.itens.map((s, k) => (
                <li key={k} className="flex gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.prioridade === "alta" ? "bg-status-danger" : s.prioridade === "media" ? "bg-status-pending" : "bg-status-success"}`}
                    title={`Prioridade ${s.prioridade}`}
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">{s.titulo}</p>
                    <p className="text-sm text-muted">{s.acao}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-6 text-sm text-muted">Ainda não há sugestões hoje.</p>
          )}
          {sug && <p className="mt-4 text-[11px] text-muted">Gerada {quando(sug.created_at)}{sug.enviado_em ? ` · enviada no WhatsApp ${quando(sug.enviado_em)}` : ""}</p>}
        </div>
      </div>

      {/* atividades */}
      <Secao titulo="Atividades" descricao="Criadas × concluídas, prazos e o que está parado">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Criadas" value={num(a.criadas)} hint={variacao(a.criadas, a.criadasAnt)} />
          <StatCard label="Concluídas" value={num(a.concluidas)} hint={variacao(a.concluidas, a.concluidasAnt)} tone="success" />
          <StatCard label="Abertas agora" value={num(a.abertas)} href="/admin/activities" />
          <StatCard label="Atrasadas" value={num(a.atrasadas)} tone={a.atrasadas ? "danger" : "default"} />
          <StatCard label="No prazo" value={num(a.noPrazoPct, "%")} hint="das concluídas" tone={a.noPrazoPct !== null && a.noPrazoPct < 80 ? "pending" : "default"} />
          <StatCard label="Tempo p/ concluir" value={a.tempoMedioDias === null ? "—" : `${a.tempoMedioDias.toLocaleString("pt-BR")} d`} hint={a.tempoMedianoDias === null ? undefined : `mediana ${a.tempoMedianoDias.toLocaleString("pt-BR")} d · do pedido à entrega`} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
          <div className="ui-card p-5">
            <p className="eyebrow mb-3">Criadas × concluídas {a.agrupado === "mes" ? "por mês" : "por dia"}</p>
            <LinhaCriadasConcluidas serie={a.serie} />
          </div>
          <Lista
            titulo="Por tipo"
            vazio="Sem atividades."
            itens={a.porTipo.map((t) => ({ chave: t.tipo, texto: TIPO[t.tipo] ?? t.tipo, valor: `${t.concluidas} concl. · ${t.abertas} abertas` }))}
          />
        </div>
        <div className="mt-4">
          <Lista
            titulo="Abertas há mais tempo"
            vazio="Nenhuma atividade aberta."
            itens={a.maisAntigas.map((x) => ({
              chave: x.id,
              href: `/admin/activities/${x.id}`,
              texto: (
                <>
                  {x.titulo} <span className="text-muted">· {x.cliente ?? "sem cliente"} · {x.responsavel ?? "sem responsável"}</span>
                </>
              ),
              valor: `${x.dias} dias${x.atrasada ? " · atrasada" : ""}`,
              tom: x.atrasada ? "danger" : x.dias > 30 ? "pending" : undefined,
            }))}
          />
        </div>
      </Secao>

      {/* distribuição */}
      <Secao titulo="Distribuição" descricao="O que chegou de fora, o que foi aprovado e o que foi descartado">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Chegaram" value={num(d.chegaram)} />
          <StatCard label="Aprovadas" value={num(d.aceitas)} tone="success" hint={d.aceitas ? `${d.aceitasFeitas} já concluídas` : undefined} />
          <StatCard label="Descartadas" value={num(d.descartadas)} tone={d.descartadas ? "danger" : "default"} />
          <StatCard label="Pendentes agora" value={num(d.pendentesAgora)} tone={d.pendentesAgora ? "pending" : "default"} href="/admin/distribuicao" />
          <StatCard label="Paradas +2 dias" value={num(d.pendentesHaMaisDe2Dias)} tone={d.pendentesHaMaisDe2Dias ? "danger" : "default"} />
          <StatCard label="Tempo até decidir" value={horas(d.tempoAteTratarHoras)} hint="mediana" />
        </div>
        <div className="mt-4 ui-card p-5">
          <p className="eyebrow mb-3">Por origem</p>
          <BarraSituacao linhas={d.porOrigem.map((o) => ({ rotulo: ORIGEM[o.origem] ?? o.origem, ...o }))} />
        </div>
      </Secao>

      {/* atendimento */}
      <Secao titulo="Atendimento no WhatsApp" descricao="Tempo do cliente mandar mensagem até alguém do escritório responder">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Resposta (mediana)" value={horas(w.respostaMedianaHoras)} tone={w.respostaMedianaHoras !== null && w.respostaMedianaHoras > 4 ? "pending" : "default"} />
          <StatCard label="Resposta (média)" value={horas(w.respostaMediaHoras)} hint={w.respostaPiorHoras === null ? undefined : `pior: ${horas(w.respostaPiorHoras)}`} />
          <StatCard label="Recebidas" value={num(w.recebidas)} />
          <StatCard label="Enviadas" value={num(w.enviadas)} />
          <StatCard label="Pela IA" value={num(w.respostasIa)} hint="Agente MC" />
          <StatCard label="Esperando +2 h" value={num(w.esperandoAgora.length)} tone={w.esperandoAgora.length ? "danger" : "default"} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="ui-card p-5 lg:col-span-2">
            <p className="eyebrow mb-3">Mensagens recebidas por hora do dia</p>
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
        <div className="mt-4">
          <Lista
            titulo="Clientes esperando resposta agora"
            vazio="Ninguém esperando há mais de 2 horas."
            itens={w.esperandoAgora.map((e) => ({ chave: e.conversa, texto: e.cliente ?? e.conversa, valor: `${e.horas} h`, tom: e.horas > 24 ? "danger" : "pending", href: "/admin/whatsapp" }))}
          />
        </div>
      </Secao>

      {/* equipe */}
      <Secao titulo="Equipe" descricao="O que cada pessoa fez no período (ações contam desde 24/10, quando a auditoria começou)">
        <div className="overflow-x-auto ui-card">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="px-4 py-2.5 font-medium">Pessoa</th>
                <th className="px-3 py-2.5 text-right font-medium">Concluídas</th>
                <th className="px-3 py-2.5 text-right font-medium">No prazo</th>
                <th className="px-3 py-2.5 text-right font-medium">Abertas</th>
                <th className="px-3 py-2.5 text-right font-medium">Atrasadas</th>
                <th className="px-3 py-2.5 text-right font-medium">Tempo médio</th>
                <th className="px-3 py-2.5 text-right font-medium">Envolvido</th>
                <th className="px-3 py-2.5 text-right font-medium">Msgs ao cliente</th>
                <th className="px-3 py-2.5 text-right font-medium">Comentários</th>
                <th className="px-3 py-2.5 text-right font-medium">Publicações</th>
                <th className="px-3 py-2.5 text-right font-medium">Atas</th>
                <th className="px-3 py-2.5 text-right font-medium">Transcrições</th>
                <th className="px-3 py-2.5 text-right font-medium">Horas</th>
                <th className="px-4 py-2.5 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border tabular-nums">
              {m.equipe.map((e) => (
                <tr key={e.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-foreground">{e.nome}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </Secao>

      {/* clientes */}
      <Secao titulo="Clientes" descricao="Satisfação calculada pelo tempo entre o pedido e a entrega (≤1 dia = 5 · ≤3 = 4,5 · ≤7 = 4 · ≤15 = 3 · ≤30 = 2 · mais = 1; −0,5 se passou do prazo; últimos 90 dias)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Satisfação média" value={m.satisfacao.media === null ? "—" : `${m.satisfacao.media.toLocaleString("pt-BR")} / 5`} hint={`${m.satisfacao.avaliadas} atividades avaliadas`} tone={m.satisfacao.media !== null && m.satisfacao.media < 3.5 ? "pending" : "success"} />
          <StatCard label="Clientes ativos" value={num(m.comercial.clientesAtivos)} href="/admin/clients" />
          <StatCard label="Clientes novos" value={num(m.comercial.clientesNovos)} />
          <StatCard label="Leads novos" value={num(m.comercial.leadsNovos)} />
          <StatCard label="Relatórios feitos" value={num(m.clientes.relatoriosNoPeriodo)} hint={`${m.clientes.relatoriosEnviados} enviados ao cliente`} href="/admin/reports" />
          <StatCard label="Esfriando" value={num(m.clientes.esfriando.length)} tone={m.clientes.esfriando.length ? "pending" : "default"} hint="risco de perder" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Lista
            titulo="Menos satisfeitos"
            vazio="Sem dados suficientes ainda."
            itens={m.satisfacao.menos.map((c) => ({ chave: c.id, href: `/admin/clients/${c.id}`, texto: c.nome, valor: `${c.nota.toLocaleString("pt-BR")} · ${c.atividades} ativ.`, tom: c.nota < 3 ? "danger" : c.nota < 4 ? "pending" : undefined }))}
          />
          <Lista
            titulo="Mais satisfeitos"
            vazio="Sem dados suficientes ainda."
            itens={m.satisfacao.mais.map((c) => ({ chave: c.id, href: `/admin/clients/${c.id}`, texto: c.nome, valor: `${c.nota.toLocaleString("pt-BR")} · ${c.atividades} ativ.`, tom: "success" }))}
          />
          <Lista
            titulo="Quem mais manda demandas"
            vazio="Nenhuma demanda no período."
            itens={m.clientes.maisDemandas.map((c) => ({ chave: c.id, href: `/admin/clients/${c.id}`, texto: c.nome, valor: num(c.demandas) }))}
          />
          <Lista
            titulo="Pouco ativos (30+ dias sem contato)"
            vazio="Todos os clientes tiveram contato recente."
            itens={m.clientes.poucoAtivos.map((c) => ({ chave: c.id, href: `/admin/clients/${c.id}`, texto: c.pf ? <>{c.nome} <span className="text-muted">· PF</span></> : c.nome, valor: c.dias === null ? "nunca" : `${c.dias} dias`, tom: c.dias === null || c.dias > 60 ? "danger" : "pending" }))}
          />
        </div>
        <div className="mt-4">
          <Lista
            titulo="Empresas com risco de perder (sem contato + satisfação + inadimplência)"
            vazio="Nenhum cliente em risco."
            itens={m.clientes.esfriando.map((c) => ({
              chave: c.id,
              href: `/admin/clients/${c.id}`,
              texto: (
                <>
                  {c.nome}{" "}
                  <span className="text-muted">
                    · {c.semContatoDias} dias sem contato · nota {c.nota?.toLocaleString("pt-BR")}
                    {c.inadimplente ? " · inadimplente" : ""}
                  </span>
                </>
              ),
              valor: `risco ${c.risco}`,
              tom: c.risco >= 70 ? "danger" : "pending",
            }))}
          />
        </div>
      </Secao>

      {/* financeiro */}
      <Secao titulo="Financeiro">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Faturado no período" value={reais(m.financas.faturado)} href="/admin/financial" />
          <StatCard label="Recebido no período" value={reais(m.financas.recebido)} tone="success" />
          <StatCard label="A receber" value={reais(m.financas.aReceber)} />
          <StatCard label="Inadimplente" value={reais(m.financas.inadimplente)} tone={m.financas.inadimplente ? "danger" : "default"} hint={`${m.financas.clientesInadimplentes} clientes`} />
        </div>
      </Secao>

      {/* sistema */}
      <Secao titulo="Sistema">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="ui-card p-5">
            <p className="eyebrow">Agente MC (WhatsApp)</p>
            <p className={`mt-2 text-sm font-medium ${m.sistema.agenteNoAr ? "text-status-success" : "text-status-danger"}`}>{m.sistema.agenteNoAr ? "● No ar" : "● Fora do ar"}</p>
          </div>
          <div className="ui-card p-5">
            <p className="eyebrow">Robô de publicações</p>
            <p className={`mt-2 text-sm font-medium ${m.sistema.publicacoes?.erro ? "text-status-danger" : "text-status-success"}`}>
              {m.sistema.publicacoes ? (m.sistema.publicacoes.erro ? "● Erro na última rodada" : "● OK") : "—"}
            </p>
            {m.sistema.publicacoes && <p className="mt-1 text-xs text-muted">última: {quando(m.sistema.publicacoes.quando)}</p>}
          </div>
          <div className="ui-card p-5">
            <p className="eyebrow">Andamentos do Astrea</p>
            <p className={`mt-2 text-sm font-medium ${m.sistema.andamentos?.erro ? "text-status-danger" : "text-status-success"}`}>
              {m.sistema.andamentos ? (m.sistema.andamentos.erro ? "● Erro na última rodada" : "● OK") : "—"}
            </p>
            {m.sistema.andamentos && <p className="mt-1 text-xs text-muted">última: {quando(m.sistema.andamentos.quando)}</p>}
          </div>
        </div>
      </Secao>

      {/* auditoria */}
      <Secao titulo="Quem fez o quê" descricao="Últimas ações no sistema (criou, editou, excluiu). Robôs aparecem como Sistema. As conversas com a IA não são registradas.">
        <div className="overflow-x-auto ui-card">
          {m.auditoria.length === 0 ? (
            <p className="p-5 text-sm text-muted">A auditoria começa a contar a partir de agora — as próximas ações aparecem aqui.</p>
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
      </Secao>
    </div>
  );
}
