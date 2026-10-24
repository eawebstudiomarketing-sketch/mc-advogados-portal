import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { agenteLigado } from "@/lib/whatsapp";

// Painel do Dono (24/10/2026): todos os números são calculados aqui, em
// código — a IA não entra (só escreve as sugestões do dia, à parte, com o
// resumo enxuto destes números). Satisfação = automática, pelo tempo entre o
// cliente pedir e a atividade ser concluída (quanto mais rápido, melhor).

const db = () => createAdminClient() as unknown as SupabaseClient;
const DIA = 86_400_000;
const hoje = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });

/** Busca tudo em páginas de 1000 (o limite do Supabase). */
async function tudo<T>(montar: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; de < 200_000; de += 1000) {
    const { data, error } = await montar(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export type Periodo = { id: string; rotulo: string; ini: string; fim: string; iniAnterior: string; fimAnterior: string };

export function periodoDe(id: string | undefined): Periodo {
  const agora = new Date();
  const h = hoje();
  const inicioDia = (d: string) => new Date(`${d}T00:00:00-03:00`);
  const fim = agora.toISOString();
  let ini: Date;
  let rotulo: string;
  switch (id) {
    case "hoje":
      ini = inicioDia(h);
      rotulo = "Hoje";
      break;
    case "7d":
      ini = new Date(agora.getTime() - 7 * DIA);
      rotulo = "Últimos 7 dias";
      break;
    case "30d":
      ini = new Date(agora.getTime() - 30 * DIA);
      rotulo = "Últimos 30 dias";
      break;
    case "mes-anterior": {
      const [y, m] = h.split("-").map(Number);
      const iniM = inicioDia(`${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-01`);
      const fimM = inicioDia(`${y}-${String(m).padStart(2, "0")}-01`);
      const dur = fimM.getTime() - iniM.getTime();
      return { id: "mes-anterior", rotulo: "Mês passado", ini: iniM.toISOString(), fim: fimM.toISOString(), iniAnterior: new Date(iniM.getTime() - dur).toISOString(), fimAnterior: iniM.toISOString() };
    }
    case "ano":
      ini = inicioDia(`${h.slice(0, 4)}-01-01`);
      rotulo = "Este ano";
      break;
    default:
      ini = inicioDia(`${h.slice(0, 7)}-01`);
      rotulo = "Este mês";
      id = "mes";
  }
  const dur = agora.getTime() - ini.getTime();
  return { id: id ?? "mes", rotulo, ini: ini.toISOString(), fim, iniAnterior: new Date(ini.getTime() - dur).toISOString(), fimAnterior: ini.toISOString() };
}

const dentro = (iso: string | null | undefined, ini: string, fim: string) => !!iso && iso >= ini && iso < fim;
const dias = (de: string, ate: string) => (Date.parse(ate) - Date.parse(de)) / DIA;
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const arred = (n: number | null, c = 1) => (n === null ? null : Math.round(n * 10 ** c) / 10 ** c);

/** Nota de satisfação (1–5) pelo tempo entre o pedido e a conclusão (ou a idade, se ainda aberta). */
export function notaPorTempo(diasCorridos: number, atrasou: boolean): number {
  const base = diasCorridos <= 1 ? 5 : diasCorridos <= 3 ? 4.5 : diasCorridos <= 7 ? 4 : diasCorridos <= 15 ? 3 : diasCorridos <= 30 ? 2 : 1;
  return Math.max(1, base - (atrasou ? 0.5 : 0));
}

type Atividade = {
  id: string;
  title: string;
  status: string;
  type: string;
  area: string | null;
  created_at: string;
  concluida_em: string | null;
  deadline: string | null;
  client_id: string | null;
  responsavel_id: string | null;
  envolvidos: string[] | null;
  archived_at: string | null;
};
type Dist = { id: string; origem: string; status: string; created_at: string; tratado_em: string | null; activity_id: string | null; client_id: string | null; tratado_por: string | null };
type Msg = { chat_jid: string; from_me: boolean; wa_timestamp: string; quem: string; job_id: string | null };

export type Metricas = Awaited<ReturnType<typeof calcularMetricas>>;

export async function calcularMetricas(p: Periodo) {
  const h = hoje();
  const agora = new Date().toISOString();
  const [atividades, dist, clientes, responsaveis, perfis, chats] = await Promise.all([
    tudo<Atividade>((a, b) => db().from("activities").select("id, title, status, type, area, created_at, concluida_em, deadline, client_id, responsavel_id, envolvidos, archived_at").range(a, b)),
    tudo<Dist>((a, b) => db().from("distribuicao").select("id, origem, status, created_at, tratado_em, activity_id, client_id, tratado_por").range(a, b)),
    tudo<{ id: string; name: string; active: boolean; created_at: string; tipo_pessoa: string }>((a, b) => db().from("clients").select("id, name, active, created_at, tipo_pessoa").range(a, b)),
    tudo<{ id: string; nome: string; profile_id: string | null }>((a, b) => db().from("responsaveis").select("id, nome, profile_id").range(a, b)),
    tudo<{ id: string; full_name: string; role: string; ativo: boolean; oculto: boolean }>((a, b) => db().from("profiles").select("id, full_name, role, ativo, oculto").in("role", ["admin", "advogado"]).range(a, b)),
    tudo<{ chat_jid: string; nome: string | null; client_id: string | null; is_group: boolean }>((a, b) => db().from("wa_chats").select("chat_jid, nome, client_id, is_group").range(a, b)),
  ]);
  const vivas = atividades.filter((x) => !x.archived_at);
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.name]));
  const nomeResp = new Map(responsaveis.map((r) => [r.id, r.nome]));
  const respDoPerfil = new Map(responsaveis.filter((r) => r.profile_id).map((r) => [r.profile_id!, r.id]));
  const abertaStatus = (s: string) => s === "aberta" || s === "em_andamento";

  /* ───────── atividades ───────── */
  const criadas = vivas.filter((x) => dentro(x.created_at, p.ini, p.fim));
  const concluidas = vivas.filter((x) => x.status === "concluida" && dentro(x.concluida_em, p.ini, p.fim));
  const criadasAnt = vivas.filter((x) => dentro(x.created_at, p.iniAnterior, p.fimAnterior)).length;
  const concluidasAnt = vivas.filter((x) => x.status === "concluida" && dentro(x.concluida_em, p.iniAnterior, p.fimAnterior)).length;
  const abertas = vivas.filter((x) => abertaStatus(x.status));
  const atrasadas = abertas.filter((x) => x.deadline && x.deadline < h);
  const noPrazo = concluidas.filter((x) => !x.deadline || (x.concluida_em ?? "").slice(0, 10) <= x.deadline);
  // pedido = quando entrou na Distribuição (se veio de lá) ou quando a atividade foi criada
  const pedidoDe = new Map<string, string>();
  for (const d of dist) if (d.activity_id) pedidoDe.set(d.activity_id, d.created_at);
  const pedido = (x: Atividade) => pedidoDe.get(x.id) ?? x.created_at;
  const temposConclusao = concluidas.map((x) => dias(pedido(x), x.concluida_em!));

  // série por dia (criadas × concluídas)
  const serie: { dia: string; criadas: number; concluidas: number }[] = [];
  const nDias = Math.min(370, Math.ceil(dias(p.ini, p.fim)));
  const porDia = nDias > 62 ? "mes" : "dia";
  const chaveData = (iso: string) => {
    const d = new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
    return porDia === "mes" ? d.slice(0, 7) : d;
  };
  const mapa = new Map<string, { criadas: number; concluidas: number }>();
  for (let t = Date.parse(p.ini); t < Date.parse(p.fim); t += DIA) mapa.set(chaveData(new Date(t).toISOString()), { criadas: 0, concluidas: 0 });
  for (const x of criadas) {
    const v = mapa.get(chaveData(x.created_at));
    if (v) v.criadas++;
  }
  for (const x of concluidas) {
    const v = mapa.get(chaveData(x.concluida_em!));
    if (v) v.concluidas++;
  }
  for (const [dia, v] of mapa) serie.push({ dia, ...v });

  const maisAntigas = [...abertas]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, 12)
    .map((x) => ({ id: x.id, titulo: x.title, cliente: x.client_id ? nomeCliente.get(x.client_id) ?? null : null, responsavel: x.responsavel_id ? nomeResp.get(x.responsavel_id) ?? null : null, dias: Math.floor(dias(x.created_at, agora)), atrasada: !!(x.deadline && x.deadline < h) }));

  const porTipo = new Map<string, { abertas: number; concluidas: number }>();
  for (const x of abertas) porTipo.set(x.type, { ...(porTipo.get(x.type) ?? { abertas: 0, concluidas: 0 }), abertas: (porTipo.get(x.type)?.abertas ?? 0) + 1 });
  for (const x of concluidas) porTipo.set(x.type, { ...(porTipo.get(x.type) ?? { abertas: 0, concluidas: 0 }), concluidas: (porTipo.get(x.type)?.concluidas ?? 0) + 1 });

  /* ───────── distribuição ───────── */
  const distPer = dist.filter((d) => dentro(d.created_at, p.ini, p.fim));
  const distOrigem = new Map<string, { pendente: number; aceita: number; descartada: number }>();
  for (const d of distPer) {
    const o = distOrigem.get(d.origem) ?? { pendente: 0, aceita: 0, descartada: 0 };
    o[d.status as "pendente" | "aceita" | "descartada"]++;
    distOrigem.set(d.origem, o);
  }
  const tratadas = dist.filter((d) => d.tratado_em && dentro(d.tratado_em, p.ini, p.fim));
  const pendentesAgora = dist.filter((d) => d.status === "pendente");
  const aceitasPer = distPer.filter((d) => d.status === "aceita");
  const aceitasFeitas = aceitasPer.filter((d) => d.activity_id && atividades.find((x) => x.id === d.activity_id)?.status === "concluida").length;

  /* ───────── satisfação automática ───────── */
  // por atividade dos últimos 90 dias: concluída → nota pelo tempo; aberta → nota pela idade
  const janela = new Date(Date.now() - 90 * DIA).toISOString();
  const notasPorCliente = new Map<string, number[]>();
  const notas: number[] = [];
  for (const x of vivas) {
    if (!x.client_id) continue;
    let nota: number | null = null;
    if (x.status === "concluida" && x.concluida_em && x.concluida_em >= janela) nota = notaPorTempo(dias(pedido(x), x.concluida_em), !!(x.deadline && x.concluida_em.slice(0, 10) > x.deadline));
    else if (abertaStatus(x.status) && dias(pedido(x), agora) > 3) nota = notaPorTempo(dias(pedido(x), agora), !!(x.deadline && x.deadline < h));
    if (nota === null) continue;
    notas.push(nota);
    notasPorCliente.set(x.client_id, [...(notasPorCliente.get(x.client_id) ?? []), nota]);
  }
  const satisfacaoClientes = [...notasPorCliente.entries()]
    .map(([id, ns]) => ({ id, nome: nomeCliente.get(id) ?? "?", nota: arred(media(ns), 1)!, atividades: ns.length }))
    .sort((a, b) => a.nota - b.nota);

  /* ───────── atendimento no WhatsApp ───────── */
  const msgs = await tudo<Msg>((a, b) =>
    db().from("wa_messages").select("chat_jid, from_me, wa_timestamp, quem, job_id").gte("wa_timestamp", new Date(Date.parse(p.ini) - 3 * DIA).toISOString()).lt("wa_timestamp", p.fim).order("wa_timestamp").range(a, b)
  );
  const jobsIds = [...new Set(msgs.filter((m) => m.job_id).map((m) => m.job_id!))];
  const autorDoJob = new Map<string, string>();
  for (let i = 0; i < jobsIds.length; i += 200) {
    const { data } = await db().from("wa_jobs").select("id, criado_por").in("id", jobsIds.slice(i, i + 200));
    for (const j of data ?? []) if (j.criado_por) autorDoJob.set(j.id, j.criado_por);
  }
  const chatCliente = new Map(chats.filter((c) => c.client_id).map((c) => [c.chat_jid, c.client_id!]));
  const nomeChat = new Map(chats.map((c) => [c.chat_jid, c.nome ?? c.chat_jid.split("@")[0]]));
  const temposResposta: number[] = [];
  const respostasPorPessoa = new Map<string, number>();
  let respostasIa = 0;
  let respostasCelular = 0;
  let recebidas = 0;
  let enviadas = 0;
  const porHora = Array.from({ length: 24 }, () => 0);
  const esperando = new Map<string, string>(); // chat → desde quando o cliente espera
  for (const m of msgs) {
    const noPeriodo = dentro(m.wa_timestamp, p.ini, p.fim);
    const deCliente = chatCliente.has(m.chat_jid);
    if (!m.from_me) {
      if (noPeriodo) {
        recebidas++;
        porHora[Number(new Date(m.wa_timestamp).toLocaleString("en-US", { timeZone: "America/Bahia", hour: "2-digit", hour12: false })) % 24]++;
      }
      if (!esperando.has(m.chat_jid)) esperando.set(m.chat_jid, m.wa_timestamp);
      continue;
    }
    if (noPeriodo) {
      enviadas++;
      const autor = m.job_id ? autorDoJob.get(m.job_id) : null;
      if (m.quem === "ia") respostasIa++;
      else if (autor) respostasPorPessoa.set(autor, (respostasPorPessoa.get(autor) ?? 0) + 1);
      else respostasCelular++;
    }
    const desde = esperando.get(m.chat_jid);
    if (desde && deCliente && noPeriodo && m.quem !== "ia") temposResposta.push((Date.parse(m.wa_timestamp) - Date.parse(desde)) / 3_600_000);
    esperando.delete(m.chat_jid);
  }
  const esperandoAgora = [...esperando.entries()]
    // só o que ficou sem resposta nos últimos 7 dias (mais antigo que isso costuma ser um "ok, obrigado")
    .filter(([jid, desde]) => chatCliente.has(jid) && Date.now() - Date.parse(desde) > 2 * 3_600_000 && Date.now() - Date.parse(desde) < 7 * DIA)
    .map(([jid, desde]) => ({ conversa: nomeChat.get(jid) ?? jid, cliente: nomeCliente.get(chatCliente.get(jid)!) ?? null, horas: Math.round((Date.now() - Date.parse(desde)) / 3_600_000) }))
    .sort((a, b) => b.horas - a.horas)
    .slice(0, 12);

  /* ───────── equipe ───────── */
  const [horas, comentarios, pubTratadas, atasFeitas, transcricoesFeitas, auditoriaPer] = await Promise.all([
    tudo<{ advogado_id: string; hours: number; date: string }>((a, b) => db().from("time_entries").select("advogado_id, hours, date").gte("date", p.ini.slice(0, 10)).lte("date", p.fim.slice(0, 10)).range(a, b)),
    tudo<{ autor_id: string; created_at: string }>((a, b) => db().from("activity_comments").select("autor_id, created_at").gte("created_at", p.ini).lt("created_at", p.fim).range(a, b)),
    tudo<{ tratada_por: string | null }>((a, b) => db().from("publicacoes").select("tratada_por").gte("tratada_em", p.ini).lt("tratada_em", p.fim).range(a, b)),
    tudo<{ profile_id: string }>((a, b) => db().from("atas").select("profile_id").gte("created_at", p.ini).lt("created_at", p.fim).range(a, b)),
    tudo<{ profile_id: string }>((a, b) => db().from("transcricoes").select("profile_id").gte("created_at", p.ini).lt("created_at", p.fim).range(a, b)),
    tudo<{ profile_id: string | null; acao: string }>((a, b) => db().from("auditoria").select("profile_id, acao").gte("quando", p.ini).lt("quando", p.fim).range(a, b)).catch(() => []),
  ]);
  const conta = <T,>(xs: T[], chave: (x: T) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const x of xs) {
      const k = chave(x);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const cHoras = new Map<string, number>();
  for (const x of horas) cHoras.set(x.advogado_id, (cHoras.get(x.advogado_id) ?? 0) + Number(x.hours));
  const cComent = conta(comentarios, (x) => x.autor_id);
  const cPub = conta(pubTratadas, (x) => x.tratada_por);
  const cAtas = conta(atasFeitas, (x) => x.profile_id);
  const cTransc = conta(transcricoesFeitas, (x) => x.profile_id);
  const cAcoes = conta(auditoriaPer, (x) => x.profile_id);
  const equipe = perfis
    .filter((x) => x.ativo && !x.oculto)
    .map((pf) => {
      const rid = respDoPerfil.get(pf.id);
      const minhas = rid ? vivas.filter((x) => x.responsavel_id === rid) : [];
      const minhasConcl = minhas.filter((x) => x.status === "concluida" && dentro(x.concluida_em, p.ini, p.fim));
      const minhasAbertas = minhas.filter((x) => abertaStatus(x.status));
      const tempos = minhasConcl.map((x) => dias(pedido(x), x.concluida_em!));
      return {
        id: pf.id,
        nome: pf.full_name,
        concluidas: minhasConcl.length,
        noPrazo: minhasConcl.filter((x) => !x.deadline || x.concluida_em!.slice(0, 10) <= x.deadline).length,
        abertas: minhasAbertas.length,
        atrasadas: minhasAbertas.filter((x) => x.deadline && x.deadline < h).length,
        tempoMedioDias: arred(media(tempos), 1),
        envolvido: rid ? vivas.filter((x) => (x.envolvidos ?? []).includes(rid) && dentro(x.created_at, p.ini, p.fim)).length : 0,
        mensagens: respostasPorPessoa.get(pf.id) ?? 0,
        horas: arred(cHoras.get(pf.id) ?? 0, 1),
        comentarios: cComent.get(pf.id) ?? 0,
        publicacoes: cPub.get(pf.id) ?? 0,
        atas: cAtas.get(pf.id) ?? 0,
        transcricoes: cTransc.get(pf.id) ?? 0,
        acoes: cAcoes.get(pf.id) ?? 0,
      };
    })
    .sort((a, b) => b.concluidas - a.concluidas);

  /* ───────── clientes ───────── */
  const ativos = clientes.filter((c) => c.active);
  const demandasPorCliente = new Map<string, number>();
  for (const x of criadas) if (x.client_id) demandasPorCliente.set(x.client_id, (demandasPorCliente.get(x.client_id) ?? 0) + 1);
  for (const d of distPer) if (d.client_id && !d.activity_id) demandasPorCliente.set(d.client_id, (demandasPorCliente.get(d.client_id) ?? 0) + 1);
  const ultimoContato = new Map<string, string>();
  for (const x of vivas) if (x.client_id && (ultimoContato.get(x.client_id) ?? "") < x.created_at) ultimoContato.set(x.client_id, x.created_at);
  const { data: ultimasMsgs } = await db().from("wa_chats").select("client_id, ultima_msg_em").not("client_id", "is", null);
  for (const c of ultimasMsgs ?? []) if (c.client_id && c.ultima_msg_em && (ultimoContato.get(c.client_id) ?? "") < c.ultima_msg_em) ultimoContato.set(c.client_id, c.ultima_msg_em);
  const maisDemandas = [...demandasPorCliente.entries()].map(([id, n]) => ({ id, nome: nomeCliente.get(id) ?? "?", demandas: n })).sort((a, b) => b.demandas - a.demandas).slice(0, 10);
  const poucoAtivos = ativos
    .map((c) => ({ id: c.id, nome: c.name, pf: c.tipo_pessoa === "PF", dias: ultimoContato.has(c.id) ? Math.floor(dias(ultimoContato.get(c.id)!, agora)) : null }))
    .filter((c) => c.dias === null || c.dias >= 30)
    .sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999))
    .slice(0, 15);
  const [{ data: financeiro }, { data: relatorios }, { count: leadsNovos }] = await Promise.all([
    db().from("financial_records").select("client_id, amount, status, due_date, paid_at"),
    db().from("monthly_reports").select("client_id, created_at, sent_at, reference_month, reference_year"),
    db().from("leads").select("id", { count: "exact", head: true }).gte("created_at", p.ini).lt("created_at", p.fim),
  ]);
  type Fin = { client_id: string; amount: number; status: string; due_date: string; paid_at: string | null };
  const fin = (financeiro ?? []) as Fin[];
  const inadimplentes = new Set(fin.filter((f) => (f.status === "pending" || f.status === "overdue") && f.due_date < h).map((f) => f.client_id));
  // risco de perder: só empresas (PJ, contrato recorrente) — PF costuma ser caso pontual
  const esfriando = ativos
    .filter((c) => c.tipo_pessoa === "PJ")
    .map((c) => {
      const semContato = ultimoContato.has(c.id) ? dias(ultimoContato.get(c.id)!, agora) : 90;
      const nota = media(notasPorCliente.get(c.id) ?? []) ?? 3;
      const risco = Math.min(100, Math.round((semContato / 60) * 40 + ((5 - nota) / 4) * 35 + (inadimplentes.has(c.id) ? 25 : 0)));
      return { id: c.id, nome: c.name, risco, semContatoDias: Math.floor(semContato), nota: arred(nota, 1), inadimplente: inadimplentes.has(c.id) };
    })
    .filter((c) => c.risco >= 40)
    .sort((a, b) => b.risco - a.risco)
    .slice(0, 10);
  const rel = (relatorios ?? []) as { client_id: string; created_at: string; sent_at: string | null }[];
  const relatoriosPer = rel.filter((r) => dentro(r.created_at, p.ini, p.fim));

  /* ───────── financeiro e comercial ───────── */
  const soma = (xs: Fin[]) => Math.round(xs.reduce((a, f) => a + Number(f.amount || 0), 0) * 100) / 100;
  const financas = {
    faturado: soma(fin.filter((f) => f.status !== "cancelled" && dentro(`${f.due_date}T12:00:00Z`, p.ini, p.fim))),
    recebido: soma(fin.filter((f) => f.status === "paid" && dentro(f.paid_at, p.ini, p.fim))),
    aReceber: soma(fin.filter((f) => f.status === "pending" && f.due_date >= h)),
    inadimplente: soma(fin.filter((f) => (f.status === "pending" || f.status === "overdue") && f.due_date < h)),
    clientesInadimplentes: inadimplentes.size,
  };
  const comercial = {
    clientesAtivos: ativos.length,
    clientesNovos: clientes.filter((c) => dentro(c.created_at, p.ini, p.fim)).length,
    leadsNovos: leadsNovos ?? 0,
  };

  /* ───────── sistema ───────── */
  const [{ data: agente }, { data: monitor }, { data: andamentos }, { data: auditRecente }] = await Promise.all([
    db().from("wa_agent").select("online, last_heartbeat").order("last_heartbeat", { ascending: false, nullsFirst: false }).limit(1).maybeSingle(),
    db().from("monitor_execucoes").select("iniciado_em, erro, origem").order("iniciado_em", { ascending: false }).limit(1).maybeSingle(),
    db().from("andamentos_sync").select("iniciado_em, erro").order("iniciado_em", { ascending: false }).limit(1).maybeSingle(),
    db().from("auditoria").select("quando, profile_id, tabela, acao, resumo, campos").order("quando", { ascending: false }).limit(40),
  ]);
  const nomePerfil = new Map(perfis.map((x) => [x.id, x.full_name]));
  const sistema = {
    agenteNoAr: agenteLigado(agente as { online: boolean; last_heartbeat: string | null } | null),
    publicacoes: monitor ? { quando: (monitor as { iniciado_em: string }).iniciado_em, erro: (monitor as { erro: string | null }).erro } : null,
    andamentos: andamentos ? { quando: (andamentos as { iniciado_em: string }).iniciado_em, erro: (andamentos as { erro: string | null }).erro } : null,
  };
  const auditoria = ((auditRecente ?? []) as { quando: string; profile_id: string | null; tabela: string; acao: string; resumo: string | null; campos: string[] | null }[]).map((a) => ({
    ...a,
    pessoa: a.profile_id ? nomePerfil.get(a.profile_id) ?? "?" : "Sistema",
  }));

  /* ───────── saúde (0–100) ───────── */
  const pNoPrazo = concluidas.length ? noPrazo.length / concluidas.length : 1;
  const pAtrasadas = abertas.length ? atrasadas.length / abertas.length : 0;
  const respMed = mediana(temposResposta);
  const satisf = media(notas) ?? 4;
  const distVelha = pendentesAgora.filter((d) => dias(d.created_at, agora) > 2).length;
  const robosOk = [sistema.agenteNoAr, !sistema.publicacoes?.erro, !sistema.andamentos?.erro].filter(Boolean).length / 3;
  const componentes = {
    prazo: Math.round(pNoPrazo * 25),
    atrasos: Math.round((1 - Math.min(1, pAtrasadas * 2)) * 15),
    resposta: respMed === null ? 20 : Math.round(Math.max(0, 1 - respMed / 24) * 20),
    satisfacao: Math.round(((satisf - 1) / 4) * 20),
    distribuicao: Math.round(Math.max(0, 1 - distVelha / 20) * 10),
    sistema: Math.round(robosOk * 10),
  };
  const saude = Object.values(componentes).reduce((a, b) => a + b, 0);

  return {
    periodo: p,
    saude,
    componentes,
    atividades: {
      criadas: criadas.length,
      criadasAnt,
      concluidas: concluidas.length,
      concluidasAnt,
      abertas: abertas.length,
      atrasadas: atrasadas.length,
      noPrazoPct: concluidas.length ? Math.round((noPrazo.length / concluidas.length) * 100) : null,
      tempoMedioDias: arred(media(temposConclusao), 1),
      tempoMedianoDias: arred(mediana(temposConclusao), 1),
      serie,
      agrupado: porDia,
      maisAntigas,
      porTipo: [...porTipo.entries()].map(([tipo, v]) => ({ tipo, ...v })).sort((a, b) => b.abertas + b.concluidas - (a.abertas + a.concluidas)),
    },
    distribuicao: {
      chegaram: distPer.length,
      aceitas: distPer.filter((d) => d.status === "aceita").length,
      descartadas: distPer.filter((d) => d.status === "descartada").length,
      pendentes: distPer.filter((d) => d.status === "pendente").length,
      pendentesAgora: pendentesAgora.length,
      pendentesHaMaisDe2Dias: distVelha,
      aceitasFeitas,
      tempoAteTratarHoras: arred(mediana(tratadas.map((d) => (Date.parse(d.tratado_em!) - Date.parse(d.created_at)) / 3_600_000)), 1),
      porOrigem: [...distOrigem.entries()].map(([origem, v]) => ({ origem, ...v })),
    },
    atendimento: {
      recebidas,
      enviadas,
      respostaMedianaHoras: arred(respMed, 1),
      respostaMediaHoras: arred(media(temposResposta), 1),
      respostaPiorHoras: temposResposta.length ? arred(Math.max(...temposResposta), 1) : null,
      respondidas: temposResposta.length,
      respostasIa,
      respostasCelular,
      respostasPorPessoa: [...respostasPorPessoa.entries()].map(([id, n]) => ({ nome: nomePerfil.get(id) ?? "?", n })).sort((a, b) => b.n - a.n),
      porHora,
      esperandoAgora,
    },
    satisfacao: { media: arred(media(notas), 1), avaliadas: notas.length, menos: satisfacaoClientes.filter((c) => c.nota < 4).slice(0, 8), mais: satisfacaoClientes.filter((c) => c.nota >= 4).reverse().slice(0, 8) },
    equipe,
    clientes: { maisDemandas, poucoAtivos, esfriando, relatoriosNoPeriodo: relatoriosPer.length, relatoriosEnviados: relatoriosPer.filter((r) => r.sent_at).length },
    financas,
    comercial,
    sistema,
    auditoria,
  };
}

/** Resumo enxuto (poucas centenas de tokens) para a IA escrever as sugestões do dia. */
export function resumoParaIa(m: Metricas) {
  return {
    periodo: m.periodo.rotulo,
    saude: m.saude,
    atividades: { criadas: m.atividades.criadas, concluidas: m.atividades.concluidas, abertas: m.atividades.abertas, atrasadas: m.atividades.atrasadas, noPrazoPct: m.atividades.noPrazoPct, tempoMedioDias: m.atividades.tempoMedioDias },
    paradasHaMaisTempo: m.atividades.maisAntigas.slice(0, 5).map((a) => `${a.titulo} (${a.cliente ?? "sem cliente"}, ${a.responsavel ?? "sem responsável"}, ${a.dias} dias${a.atrasada ? ", atrasada" : ""})`),
    distribuicao: { pendentes: m.distribuicao.pendentesAgora, haMaisDe2Dias: m.distribuicao.pendentesHaMaisDe2Dias, horasAteTratar: m.distribuicao.tempoAteTratarHoras },
    whatsapp: { respostaMedianaHoras: m.atendimento.respostaMedianaHoras, esperandoMaisDe2h: m.atendimento.esperandoAgora.slice(0, 5).map((e) => `${e.cliente ?? e.conversa} (${e.horas} h)`) },
    satisfacaoMedia: m.satisfacao.media,
    clientesMenosSatisfeitos: m.satisfacao.menos.slice(0, 4).map((c) => `${c.nome} (${c.nota})`),
    clientesEsfriando: m.clientes.esfriando.slice(0, 4).map((c) => `${c.nome} (risco ${c.risco}, ${c.semContatoDias} dias sem contato${c.inadimplente ? ", inadimplente" : ""})`),
    equipe: m.equipe.map((e) => `${e.nome}: ${e.concluidas} concluídas, ${e.abertas} abertas, ${e.atrasadas} atrasadas`),
    financeiro: m.financas,
    sistema: { agenteNoAr: m.sistema.agenteNoAr, erroPublicacoes: !!m.sistema.publicacoes?.erro, erroAndamentos: !!m.sistema.andamentos?.erro },
  };
}
