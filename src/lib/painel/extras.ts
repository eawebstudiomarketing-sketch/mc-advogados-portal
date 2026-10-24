import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { tudo } from "./metricas";
import { DIA, dataBahia, dentro, hojeBahia, type Periodo } from "./base";

// Painel do Dono — dados de cada aba, carregados só quando a aba abre.
const db = () => createAdminClient() as unknown as SupabaseClient;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ym: string) => `${MESES[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
/** Os últimos n meses (AAAA-MM), do mais antigo ao atual. */
export function ultimosMeses(n: number) {
  const h = hojeBahia();
  let [y, m] = h.split("-").map(Number);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m--;
    if (!m) {
      m = 12;
      y--;
    }
  }
  return out;
}

/* ───────── Distribuição ───────── */
export type LinhaDist = { id: string; titulo: string; origem: string; status: string; criada: string; tratada: string | null; clienteId: string | null; quemDecidiu: string | null; activityId: string | null };
export async function linhasDistribuicao(): Promise<LinhaDist[]> {
  const [rows, perfis] = await Promise.all([
    tudo<{ id: string; titulo: string; origem: string; status: string; created_at: string; tratado_em: string | null; client_id: string | null; tratado_por: string | null; activity_id: string | null }>((a, b) =>
      db().from("distribuicao").select("id, titulo, origem, status, created_at, tratado_em, client_id, tratado_por, activity_id").range(a, b)
    ),
    db().from("profiles").select("id, full_name"),
  ]);
  const nome = new Map(((perfis.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  return rows.map((r) => ({ id: r.id, titulo: r.titulo, origem: r.origem, status: r.status, criada: r.created_at, tratada: r.tratado_em, clienteId: r.client_id, quemDecidiu: r.tratado_por ? nome.get(r.tratado_por) ?? "?" : null, activityId: r.activity_id }));
}

/* ───────── Ficha do cliente ───────── */
export async function fichaCliente(clienteId: string) {
  const [{ data: cli }, { data: procs }, { data: chats }, { data: fin }, { data: rels }, { data: dist }] = await Promise.all([
    db().from("clients").select("id, name, tipo_pessoa, active, created_at").eq("id", clienteId).maybeSingle(),
    db().from("processes").select("id, numero_processo, titulo, area, ultimo_andamento_em, status").eq("client_id", clienteId).order("ultimo_andamento_em", { ascending: false, nullsFirst: false }),
    db().from("wa_chats").select("chat_jid, nome, ultima_msg_em").eq("client_id", clienteId),
    db().from("financial_records").select("amount, status, due_date, paid_at").eq("client_id", clienteId),
    db().from("monthly_reports").select("reference_month, reference_year, sent_at").eq("client_id", clienteId).order("reference_year", { ascending: false }).order("reference_month", { ascending: false }).limit(6),
    db().from("distribuicao").select("titulo, origem, status, created_at").eq("client_id", clienteId).order("created_at", { ascending: false }).limit(15),
  ]);
  if (!cli) return null;
  const jids = (chats ?? []).map((c) => c.chat_jid as string);
  let ultimaDeles: string | null = null;
  let ultimaNossa: string | null = null;
  if (jids.length) {
    const [{ data: d }, { data: n }] = await Promise.all([
      db().from("wa_messages").select("wa_timestamp").in("chat_jid", jids).eq("from_me", false).order("wa_timestamp", { ascending: false }).limit(1),
      db().from("wa_messages").select("wa_timestamp").in("chat_jid", jids).eq("from_me", true).order("wa_timestamp", { ascending: false }).limit(1),
    ]);
    ultimaDeles = (d?.[0]?.wa_timestamp as string) ?? null;
    ultimaNossa = (n?.[0]?.wa_timestamp as string) ?? null;
  }
  const h = hojeBahia();
  type F = { amount: number; status: string; due_date: string; paid_at: string | null };
  const f = (fin ?? []) as F[];
  const soma = (xs: F[]) => xs.reduce((s, x) => s + Number(x.amount || 0), 0);
  return {
    cliente: { id: cli.id as string, nome: cli.name as string, pf: cli.tipo_pessoa === "PF", ativo: cli.active as boolean, desde: cli.created_at as string },
    processos: ((procs ?? []) as { id: string; numero_processo: string | null; titulo: string | null; area: string | null; ultimo_andamento_em: string | null }[]).map((p) => ({ id: p.id, numero: p.numero_processo, titulo: p.titulo, area: p.area, ultimo: p.ultimo_andamento_em })),
    whatsapp: { conversas: jids.length, ultimaDeles, ultimaNossa, esperando: !!ultimaDeles && (!ultimaNossa || ultimaNossa < ultimaDeles) },
    financeiro: { recebido: soma(f.filter((x) => x.status === "paid")), aReceber: soma(f.filter((x) => x.status === "pending" && x.due_date >= h)), atrasado: soma(f.filter((x) => (x.status === "pending" || x.status === "overdue") && x.due_date < h)) },
    relatorios: ((rels ?? []) as { reference_month: number; reference_year: number; sent_at: string | null }[]).map((r) => ({ ref: `${String(r.reference_month).padStart(2, "0")}/${r.reference_year}`, enviado: !!r.sent_at })),
    distribuicao: ((dist ?? []) as { titulo: string; origem: string; status: string; created_at: string }[]),
  };
}

/* ───────── Processos e Publicações ───────── */
export async function dadosProcessos(p: Periodo) {
  const ha90 = new Date(Date.now() - 90 * DIA).toISOString();
  const [procs, andNovos, pubs, clientes] = await Promise.all([
    tudo<{ id: string; client_id: string | null; numero_processo: string | null; titulo: string | null; area: string | null; ultimo_andamento_em: string | null; responsavel_nome: string | null; status: string }>((a, b) =>
      db().from("processes").select("id, client_id, numero_processo, titulo, area, ultimo_andamento_em, responsavel_nome, status").range(a, b)
    ),
    tudo<{ id: string; process_id: string; data: string | null; descricao: string | null; created_at: string; situacao: string; tratado_em: string | null }>((a, b) =>
      db().from("andamentos").select("id, process_id, data, descricao, created_at, situacao, tratado_em").or(`created_at.gte.${p.ini},situacao.eq.novo`).range(a, b)
    ),
    tudo<{ id: string; client_id: string | null; process_id: string | null; numero_processo: string | null; tribunal: string | null; status: string; created_at: string; tratada_em: string | null; activity_id: string | null; tipo_comunicacao: string | null }>((a, b) =>
      db().from("publicacoes").select("id, client_id, process_id, numero_processo, tribunal, status, created_at, tratada_em, activity_id, tipo_comunicacao").gte("created_at", new Date(Math.min(Date.parse(p.iniAnterior), Date.now() - 60 * DIA)).toISOString()).range(a, b)
    ),
    db().from("clients").select("id, name"),
  ]);
  const nomeCli = new Map(((clientes.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const proc = new Map(procs.map((x) => [x.id, x]));
  const ativos = procs.filter((x) => x.status === "ativo");
  const andPer = andNovos.filter((a) => dentro(a.created_at, p.ini, p.fim));
  const pubPer = pubs.filter((x) => dentro(x.created_at, p.ini, p.fim));
  const porArea = new Map<string, number>();
  for (const x of ativos) porArea.set(x.area ?? "Sem área", (porArea.get(x.area ?? "Sem área") ?? 0) + 1);
  const porTribunal = new Map<string, number>();
  for (const x of pubPer) porTribunal.set(x.tribunal ?? "?", (porTribunal.get(x.tribunal ?? "?") ?? 0) + 1);
  return {
    ativos: ativos.length,
    andamentosNoPeriodo: andPer.length,
    andamentosNovosSemTratar: andNovos.filter((a) => a.situacao === "novo").length,
    publicacoesNoPeriodo: pubPer.length,
    publicacoesNaoTratadas: pubs.filter((x) => x.status === "nao_tratada").length,
    publicacoesTratadasNoPeriodo: pubs.filter((x) => x.status !== "nao_tratada" && dentro(x.tratada_em, p.ini, p.fim)).length,
    tempoTratarPublicacaoHoras: (() => {
      const ts = pubs.filter((x) => x.tratada_em && dentro(x.tratada_em, p.ini, p.fim)).map((x) => (Date.parse(x.tratada_em!) - Date.parse(x.created_at)) / 3_600_000).sort((a, b) => a - b);
      return ts.length ? Math.round(ts[Math.floor(ts.length / 2)] * 10) / 10 : null;
    })(),
    porArea: [...porArea.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor),
    porTribunal: [...porTribunal.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8),
    ultimosAndamentos: andNovos
      .filter((a) => a.situacao === "novo")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 12)
      .map((a) => {
        const pr = proc.get(a.process_id);
        return { id: a.id, processoId: a.process_id, numero: pr?.numero_processo ?? "", cliente: pr?.client_id ? nomeCli.get(pr.client_id) ?? null : null, descricao: String(a.descricao ?? "").replace(/^\s*N[°º]\s*\d+\s*/i, "").split(/\n/)[0].replace(/\s+/g, " ").slice(0, 110), quando: a.created_at };
      }),
    parados: ativos
      .filter((x) => !x.ultimo_andamento_em || x.ultimo_andamento_em < ha90)
      .sort((a, b) => (a.ultimo_andamento_em ?? "").localeCompare(b.ultimo_andamento_em ?? ""))
      .slice(0, 12)
      .map((x) => ({ id: x.id, numero: x.numero_processo, titulo: x.titulo, cliente: x.client_id ? nomeCli.get(x.client_id) ?? null : null, ultimo: x.ultimo_andamento_em, resp: x.responsavel_nome })),
    publicacoesParadas: pubs
      .filter((x) => x.status === "nao_tratada")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, 10)
      .map((x) => ({ id: x.id, numero: x.numero_processo, tribunal: x.tribunal, tipo: x.tipo_comunicacao, cliente: x.client_id ? nomeCli.get(x.client_id) ?? null : null, dias: Math.floor((Date.now() - Date.parse(x.created_at)) / DIA) })),
  };
}

/* ───────── Comercial ───────── */
export async function dadosComercial(p: Periodo) {
  const meses = ultimosMeses(12);
  const [cls, leads, contratos, atas] = await Promise.all([
    tudo<{ id: string; name: string; tipo_pessoa: string; created_at: string; active: boolean }>((a, b) => db().from("clients").select("id, name, tipo_pessoa, created_at, active").range(a, b)),
    tudo<{ id: string; nome: string | null; origem: string; status: string; area: string | null; score: number | null; created_at: string }>((a, b) => db().from("leads").select("id, nome, origem, status, area, score, created_at").range(a, b)),
    tudo<{ id: string; client_id: string; title: string; status: string; value: number | null; start_date: string; created_at: string }>((a, b) => db().from("contracts").select("id, client_id, title, status, value, start_date, created_at").range(a, b)),
    tudo<{ id: string; tipo: string; created_at: string }>((a, b) => db().from("atas").select("id, tipo, created_at").range(a, b)),
  ]);
  const nomeCli = new Map(cls.map((c) => [c.id, c.name]));
  const conta = <T,>(xs: T[], k: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(k(x), (m.get(k(x)) ?? 0) + 1);
    return [...m.entries()].map(([rotulo, valor]) => ({ rotulo, valor })).sort((a, b) => b.valor - a.valor);
  };
  const leadsPer = leads.filter((l) => dentro(l.created_at, p.ini, p.fim));
  return {
    clientesNovos: cls.filter((c) => dentro(c.created_at, p.ini, p.fim)).length,
    clientesNovosPj: cls.filter((c) => c.tipo_pessoa === "PJ" && dentro(c.created_at, p.ini, p.fim)).length,
    clientesAtivos: cls.filter((c) => c.active).length,
    novosPorMes: meses.map((ym) => ({ rotulo: rotuloMes(ym), valor: cls.filter((c) => dataBahia(c.created_at).slice(0, 7) === ym).length })),
    leadsNovos: leadsPer.length,
    leadsQuentes: leads.filter((l) => l.status === "quente").length,
    leadsViraramCliente: leadsPer.filter((l) => l.status === "cliente").length,
    leadsPorStatus: conta(leads, (l) => l.status),
    leadsPorOrigem: conta(leadsPer, (l) => l.origem),
    leadsRecentes: leads.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8),
    contratosAtivos: contratos.filter((c) => c.status === "active").length,
    contratosNovos: contratos.filter((c) => dentro(c.created_at, p.ini, p.fim)).map((c) => ({ id: c.id, titulo: c.title, cliente: nomeCli.get(c.client_id) ?? "?", valor: c.value })),
    valorContratosAtivos: contratos.filter((c) => c.status === "active").reduce((s, c) => s + Number(c.value ?? 0), 0),
    onboardings: atas.filter((a) => a.tipo === "onboarding" && dentro(a.created_at, p.ini, p.fim)).length,
  };
}

/* ───────── Financeiro ───────── */
export async function dadosFinanceiro() {
  const meses = ultimosMeses(12);
  const h = hojeBahia();
  const [fin, cls] = await Promise.all([
    tudo<{ client_id: string; amount: number; status: string; due_date: string; paid_at: string | null }>((a, b) => db().from("financial_records").select("client_id, amount, status, due_date, paid_at").range(a, b)),
    db().from("clients").select("id, name"),
  ]);
  const nomeCli = new Map(((cls.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const porMes = meses.map((ym) => ({
    mes: ym,
    faturado: Math.round(fin.filter((f) => f.status !== "cancelled" && f.due_date.slice(0, 7) === ym).reduce((s, f) => s + Number(f.amount), 0)),
    recebido: Math.round(fin.filter((f) => f.status === "paid" && f.paid_at && dataBahia(f.paid_at).slice(0, 7) === ym).reduce((s, f) => s + Number(f.amount), 0)),
  }));
  const porCliente = new Map<string, number>();
  for (const f of fin) if (f.status === "paid") porCliente.set(f.client_id, (porCliente.get(f.client_id) ?? 0) + Number(f.amount));
  const inad = new Map<string, { valor: number; desde: string }>();
  for (const f of fin)
    if ((f.status === "pending" || f.status === "overdue") && f.due_date < h) {
      const v = inad.get(f.client_id) ?? { valor: 0, desde: f.due_date };
      inad.set(f.client_id, { valor: v.valor + Number(f.amount), desde: v.desde < f.due_date ? v.desde : f.due_date });
    }
  return {
    vazio: fin.length === 0,
    porMes,
    topClientes: [...porCliente.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, valor]) => ({ id, nome: nomeCli.get(id) ?? "?", valor })),
    inadimplentes: [...inad.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([id, v]) => ({ id, nome: nomeCli.get(id) ?? "?", valor: v.valor, desde: v.desde })),
  };
}
