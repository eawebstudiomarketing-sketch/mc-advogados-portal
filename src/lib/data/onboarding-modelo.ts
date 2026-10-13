import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PerguntaModelo = { id: string; stage_id: string; texto: string };

/** Perguntas que o admin marcou para entrar em todo onboarding novo. */
export async function listPerguntasModelo(): Promise<PerguntaModelo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("onboarding_perguntas_modelo")
    .select("id, stage_id, texto")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}
