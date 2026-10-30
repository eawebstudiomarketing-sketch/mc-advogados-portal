import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { rotinaDoDia } from "@/lib/data/rotina-diaria";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { hojeBahia, lerRelatorio } from "./dados";

// Relógio no alto do sistema (Rotinas v2, 30/10): leva à rotina da própria
// pessoa e acende um alerta quando uma tarefa fixa passou da hora sem ser
// marcada, ou quando já são 18h ou mais e o relatório do dia não foi enviado.

export type AlertaRotina = { href: string; atrasadas: number; relatorioPendente: boolean } | null;

const HORA_DO_RELATORIO = 18;

export async function alertaDaRotina(profileId: string): Promise<AlertaRotina> {
  const eu = await responsavelDoPerfil(profileId);
  if (!eu) return null;
  const adm = createAdminClient() as unknown as SupabaseClient;
  const hoje = hojeBahia();
  const [itens, { data: resp }] = await Promise.all([rotinaDoDia(eu, hoje, adm), adm.from("responsaveis").select("rotina_modelo_id").eq("id", eu).maybeSingle()]);
  const temModelo = !!resp?.rotina_modelo_id;
  if (!itens.length && !temModelo) return null;
  const atrasadas = itens.filter((i) => !i.feito && i.situacao === "atrasado").length;
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", hour: "2-digit", hour12: false }).format(new Date()));
  let relatorioPendente = false;
  if (temModelo && hora >= HORA_DO_RELATORIO) relatorioPendente = (await lerRelatorio(eu, hoje))?.status !== "enviado";
  return { href: `/admin/rotinas?pessoa=${eu}`, atrasadas, relatorioPendente };
}
