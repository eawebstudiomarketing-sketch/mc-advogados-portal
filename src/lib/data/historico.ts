import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Histórico por registro (item 12 da auditoria, 30/10/2026): quem criou,
// editou ou excluiu e quais campos mudaram. Vem da tabela auditoria (gatilhos
// da 0046), que o banco só deixa o admin máximo ler; para os outros volta vazio.

import { IGNORAR, type EventoHistorico } from "@/lib/historico-campos";

export type { EventoHistorico };

export async function getHistorico(tabela: "activities" | "clients" | "processes", registroId: string, limite = 30): Promise<EventoHistorico[]> {
  // auditoria não está nos tipos gerados (mesmo jeito do Painel do Dono)
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await supabase
    .from("auditoria")
    .select("quando, acao, campos, profile_id, profiles(full_name)")
    .eq("tabela", tabela)
    .eq("registro_id", registroId)
    .order("quando", { ascending: false })
    .limit(limite);
  if (error || !data) return [];
  type Linha = { quando: string; acao: string; campos: string[] | null; profiles: { full_name: string } | null };
  return (data as unknown as Linha[])
    .map((e) => ({
      quando: e.quando,
      quem: e.profiles?.full_name ?? null,
      acao: e.acao as EventoHistorico["acao"],
      campos: (e.campos ?? []).filter((c) => !IGNORAR.has(c)),
    }))
    .filter((e) => e.acao !== "editou" || e.campos.length > 0);
}
