import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { HandoffAnswers } from "@/lib/handoff-schema";
import type { Database } from "@/lib/supabase/types";

// Ficha de Handoff + triagem antiga de um cliente (tabela client_handoffs, só
// a equipe lê; o cliente não tem acesso). Sem `db`, usa a sessão de quem está
// logado (RLS: admin).
export type HandoffDoCliente = {
  handoff: HandoffAnswers | null;
  handoffUpdatedAt: string | null;
  triagem: string | null;
};

export async function getHandoff(clientId: string, db?: SupabaseClient<Database>): Promise<HandoffDoCliente> {
  const c = db ?? (await createClient());
  const { data } = await c.from("client_handoffs").select("*").eq("client_id", clientId).maybeSingle();
  return {
    handoff: (data?.handoff as HandoffAnswers | null) ?? null,
    handoffUpdatedAt: data?.handoff_updated_at ?? null,
    triagem: data?.triagem ?? null,
  };
}
