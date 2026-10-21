import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type Andamento = Database["public"]["Tables"]["andamentos"]["Row"];
export type SituacaoAndamento = Andamento["situacao"];

export const ROTULO_SITUACAO: Record<"novo" | "tratado" | "descartado", string> = {
  novo: "Não tratados",
  tratado: "Tratados",
  descartado: "Descartados",
};

export type GrupoAndamentos = {
  processo: {
    id: string;
    numero_processo: string;
    titulo: string | null;
    vara_tribunal: string | null;
    classe: string | null;
    client_id: string | null;
    cliente_nome: string | null;
    clients: { name: string } | null;
  };
  andamentos: Andamento[];
  importantes: number;
};

const PROC = "id, numero_processo, titulo, vara_tribunal, classe, client_id, cliente_nome, clients(name)";

/** Andamentos agrupados por processo (cartão "Andamento recebido"). */
export async function listAndamentosAgrupados(op: { situacao: "novo" | "tratado" | "descartado"; processId?: string; busca?: string }): Promise<GrupoAndamentos[]> {
  const supabase = await createClient();
  let q = supabase
    .from("andamentos")
    .select(`*, processes!inner(${PROC})`)
    .eq("situacao", op.situacao)
    .order("data", { ascending: false })
    .limit(400);
  if (op.processId) q = q.eq("process_id", op.processId);
  if (op.situacao !== "novo") q = q.gte("tratado_em", new Date(Date.now() - 30 * 86_400_000).toISOString());
  const { data } = await q;
  const termo = (op.busca ?? "").trim().toLowerCase();
  const dig = termo.replace(/\D/g, "");
  const grupos = new Map<string, GrupoAndamentos>();
  for (const a of data ?? []) {
    const { processes: p, ...andamento } = a as typeof a & { processes: GrupoAndamentos["processo"] };
    if (termo) {
      const alvo = `${p.numero_processo} ${p.titulo ?? ""} ${p.cliente_nome ?? ""} ${p.clients?.name ?? ""} ${andamento.descricao}`.toLowerCase();
      if (!alvo.includes(termo) && !(dig.length >= 4 && p.numero_processo.replace(/\D/g, "").includes(dig))) continue;
    }
    const g = grupos.get(p.id) ?? { processo: p, andamentos: [], importantes: 0 };
    g.andamentos.push(andamento as Andamento);
    if (andamento.importante) g.importantes++;
    grupos.set(p.id, g);
  }
  return [...grupos.values()];
}

export async function listAndamentosDoProcesso(processId: string, limite = 300): Promise<Andamento[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("andamentos").select("*").eq("process_id", processId).order("data", { ascending: false }).limit(limite);
  return data ?? [];
}

export async function contadoresAndamentos() {
  const supabase = await createClient();
  const inicioHoje = new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date()) + "T00:00:00-03:00").toISOString();
  const [{ count: novos }, { count: importantes }, { count: hoje }, { data: ultima }] = await Promise.all([
    supabase.from("andamentos").select("id", { count: "exact", head: true }).eq("situacao", "novo"),
    supabase.from("andamentos").select("id", { count: "exact", head: true }).eq("situacao", "novo").eq("importante", true),
    supabase.from("andamentos").select("id", { count: "exact", head: true }).gte("created_at", inicioHoje).neq("situacao", "historico"),
    supabase.from("andamentos_sync").select("iniciado_em, erro, novos, processos").order("iniciado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { novos: novos ?? 0, importantes: importantes ?? 0, hoje: hoje ?? 0, ultima };
}
