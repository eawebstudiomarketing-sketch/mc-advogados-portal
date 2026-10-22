import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Andamento } from "@/lib/data/andamentos";
import type { Publicacao } from "@/lib/data/publicacoes";

// Alertas no padrão do Astrea: aba Publicações ("Publicação recebida") e aba
// Andamentos ("Andamento recebido", um cartão por processo).

export type ProcessoAlerta = {
  id: string;
  numero_processo: string;
  titulo: string | null;
  classe: string | null;
  vara_tribunal: string | null;
  instancia: number | null;
  status: string;
  responsavel_nome: string | null;
  client_id: string | null;
  cliente_nome: string | null;
  clients: { name: string } | null;
};

const PROC = "id, numero_processo, titulo, classe, vara_tribunal, instancia, status, responsavel_nome, client_id, cliente_nome, clients(name)";

export type AlertaAndamentos = {
  processo: ProcessoAlerta;
  andamentos: Andamento[];
  importantes: number;
  /** quando o alerta chegou (andamento mais recente recebido) */
  recebidoEm: string;
};

/** Aba Andamentos: andamentos não tratados agrupados por processo, alerta mais novo primeiro. */
export async function alertasDeAndamentos(busca?: string): Promise<AlertaAndamentos[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("andamentos")
    .select(`*, processes!inner(${PROC})`)
    .eq("situacao", "novo")
    .order("data", { ascending: false })
    .limit(1500);
  const termo = (busca ?? "").trim().toLowerCase();
  const dig = termo.replace(/\D/g, "");
  const grupos = new Map<string, AlertaAndamentos>();
  for (const a of data ?? []) {
    const { processes: p, ...andamento } = a as typeof a & { processes: ProcessoAlerta };
    if (termo) {
      const alvo = `${p.numero_processo} ${p.titulo ?? ""} ${p.cliente_nome ?? ""} ${p.clients?.name ?? ""}`.toLowerCase();
      if (!alvo.includes(termo) && !(dig.length >= 4 && p.numero_processo.replace(/\D/g, "").includes(dig))) continue;
    }
    const g = grupos.get(p.id) ?? { processo: p, andamentos: [], importantes: 0, recebidoEm: andamento.created_at };
    g.andamentos.push(andamento as Andamento);
    if (andamento.importante) g.importantes++;
    if (andamento.created_at > g.recebidoEm) g.recebidoEm = andamento.created_at;
    grupos.set(p.id, g);
  }
  return [...grupos.values()].sort((a, b) => b.recebidoEm.localeCompare(a.recebidoEm));
}

/** Aba Publicações: publicações não tratadas cujo alerta não foi descartado. */
export async function alertasDePublicacoes(busca?: string): Promise<Publicacao[]> {
  const supabase = await createClient();
  let q = supabase
    .from("publicacoes")
    .select("*, clients(id, name), processes(id, numero_processo, profiles(full_name))")
    .eq("status", "nao_tratada")
    .is("alerta_descartado_em", null)
    .order("created_at", { ascending: false })
    .limit(300);
  const termo = (busca ?? "").trim();
  if (termo) {
    const dig = termo.replace(/\D/g, "");
    q = dig.length >= 4 ? q.like("numero_processo", `%${dig}%`) : q.or(`titulo_processo.ilike.%${termo.replace(/[%,()]/g, " ")}%,orgao.ilike.%${termo.replace(/[%,()]/g, " ")}%`);
  }
  const { data } = await q;
  return (data ?? []) as Publicacao[];
}

export async function contadoresAlertas(): Promise<{ publicacoes: number; andamentos: number }> {
  const supabase = await createClient();
  const [{ count: pubs }, { data: procs }] = await Promise.all([
    supabase.from("publicacoes").select("id", { count: "exact", head: true }).eq("status", "nao_tratada").is("alerta_descartado_em", null),
    supabase.from("andamentos").select("process_id").eq("situacao", "novo").limit(5000),
  ]);
  return { publicacoes: pubs ?? 0, andamentos: new Set((procs ?? []).map((p) => p.process_id)).size };
}

export async function processoDoAlerta(id: string): Promise<ProcessoAlerta | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("processes").select(PROC).eq("id", id).maybeSingle();
  return (data as ProcessoAlerta | null) ?? null;
}

/** Andamentos do alerta (os não tratados) + os já tratados hoje neste processo, como a tela "Andamentos automáticos". */
export async function andamentosParaTratar(processId: string): Promise<Andamento[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("andamentos").select("*").eq("process_id", processId).eq("situacao", "novo").order("data", { ascending: false });
  return data ?? [];
}

/** "Ver atividades pendentes": atividades abertas ligadas a andamentos/publicações deste processo ou que citam o número. */
export async function atividadesPendentesDoProcesso(p: { id: string; numero_processo: string }) {
  const supabase = await createClient();
  const [{ data: deAnd }, { data: dePub }] = await Promise.all([
    supabase.from("andamentos").select("activity_id").eq("process_id", p.id).not("activity_id", "is", null),
    supabase.from("publicacoes").select("activity_id").eq("process_id", p.id).not("activity_id", "is", null),
  ]);
  const ids = [...new Set([...(deAnd ?? []), ...(dePub ?? [])].map((x) => x.activity_id!))];
  const filtros = [`title.ilike.%${p.numero_processo}%`, `description.ilike.%${p.numero_processo}%`];
  if (ids.length) filtros.push(`id.in.(${ids.join(",")})`);
  const { data } = await supabase
    .from("activities")
    .select("id, title, deadline, status")
    .in("status", ["aberta", "em_andamento"])
    .is("archived_at", null)
    .or(filtros.join(","))
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(30);
  return data ?? [];
}

export type Comentario = { id: string; andamento_id: string | null; publicacao_id: string | null; autor_nome: string | null; texto: string; created_at: string };

export async function comentariosDe(op: { andamentos?: string[]; publicacao?: string }): Promise<Comentario[]> {
  const supabase = await createClient();
  let q = supabase.from("alerta_comentarios").select("id, andamento_id, publicacao_id, autor_nome, texto, created_at").order("created_at");
  if (op.publicacao) q = q.eq("publicacao_id", op.publicacao);
  else if (op.andamentos?.length) q = q.in("andamento_id", op.andamentos);
  else return [];
  const { data } = await q;
  return data ?? [];
}

/** "Hoje - 17:25", "Ontem - 09:24" ou "02/09/2026 - 09:31", como o Astrea. */
export function quandoAlerta(iso: string): string {
  const tz = "America/Bahia";
  const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const hoje = dia(new Date());
  const ontem = dia(new Date(Date.now() - 86_400_000));
  const rot = dia(d) === hoje ? "Hoje" : dia(d) === ontem ? "Ontem" : d.toLocaleDateString("pt-BR", { timeZone: tz });
  return `${rot} - ${hora}`;
}

/** "AUTOR x RÉU - 1º Grau - Classe", como o título do alerta no Astrea. */
export const tituloProcesso = (p: { titulo: string | null; instancia: number | null; classe: string | null; numero_processo: string }) =>
  [p.titulo ?? p.numero_processo, p.instancia ? `${p.instancia}º Grau` : null, p.classe].filter(Boolean).join(" - ");
