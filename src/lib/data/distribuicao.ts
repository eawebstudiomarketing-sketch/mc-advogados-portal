import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

// Distribuição: demandas que chegam de fora (grupo do cliente no WhatsApp,
// pedido aberto no portal do cliente) esperando alguém da equipe distribuir.

export type ItemDistribuicao = Database["public"]["Tables"]["distribuicao"]["Row"] & {
  clients: { id: string; name: string } | null;
  responsaveis: { id: string; nome: string } | null;
  activities: { id: string; title: string; status: string; responsavel_id: string | null } | null;
};

export type Trecho = { texto: string; quem?: string | null; em?: string | null };

export type FiltroDistribuicao = {
  status?: string;
  origem?: string;
  area?: string;
  cliente?: string;
  busca?: string;
};

export async function listDistribuicao(f: FiltroDistribuicao = {}): Promise<ItemDistribuicao[]> {
  const supabase = await createClient();
  let q = supabase
    .from("distribuicao")
    .select("*, clients(id, name), responsaveis(id, nome), activities(id, title, status, responsavel_id)")
    .order("created_at", { ascending: false })
    .limit(200);
  q = q.eq("status", f.status && ["pendente", "aceita", "descartada"].includes(f.status) ? f.status : "pendente");
  if (f.origem) q = q.eq("origem", f.origem);
  if (f.area) q = q.eq("area", f.area);
  if (f.cliente) q = q.eq("client_id", f.cliente);
  if (f.busca?.trim()) {
    const t = f.busca.trim().replace(/[%,()]/g, " ");
    q = q.or(`titulo.ilike.%${t}%,descricao.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as ItemDistribuicao[];
}

export async function contarDistribuicaoPendentes(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase.from("distribuicao").select("id", { count: "exact", head: true }).eq("status", "pendente");
  return count ?? 0;
}

export async function contadoresDistribuicao() {
  const supabase = await createClient();
  const inicioHoje = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date())}T00:00:00-03:00`
  ).toISOString();
  const conta = async (fn: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await fn(base())).count ?? 0;
  const base = () => supabase.from("distribuicao").select("id", { count: "exact", head: true });
  const [pendentes, zap, portal, hoje] = await Promise.all([
    conta((q) => q.eq("status", "pendente")),
    conta((q) => q.eq("status", "pendente").eq("origem", "whatsapp")),
    conta((q) => q.eq("status", "pendente").eq("origem", "portal_cliente")),
    conta((q) => q.neq("status", "pendente").gte("tratado_em", inicioHoje)),
  ]);
  return { pendentes, zap, portal, hoje };
}
