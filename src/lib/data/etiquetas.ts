import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Etiqueta = { id: string; nome: string; cor: string };

/** Etiquetas do escritório, em ordem alfabética. */
export async function listEtiquetas(): Promise<Etiqueta[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("etiquetas").select("id, nome, cor").order("nome");
  return data ?? [];
}
