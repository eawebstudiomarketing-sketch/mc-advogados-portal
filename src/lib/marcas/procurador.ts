import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResultadoBusca } from "@/lib/marcas/inpi";

// Procurador na carteira do portal (10/11/2026): o nome está gravado com acento
// ("MAURÍCIO OLIVEIRA…") e o ilike do banco não ignora acento, então "MAURICIO"
// não achava nada. A carteira é pequena: filtra aqui, sem acento e sem caixa.

const sem = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

export async function buscarProcuradorNaCarteira(termo: string): Promise<ResultadoBusca[]> {
  const t = sem(termo);
  if (!t) return [];
  const { data } = await (createAdminClient() as unknown as SupabaseClient).from("marcas").select("processo, nome, situacao, titular, classe, deposito, procurador").not("procurador", "is", null).limit(5000);
  return (data ?? [])
    .filter((m: { procurador: string | null }) => sem(m.procurador).includes(t))
    .map((m) => ({ processo: m.processo, codPedido: "", marca: m.nome ?? "", situacao: m.situacao ?? "", titular: m.titular ?? "", classes: m.classe ?? "", deposito: m.deposito }));
}
