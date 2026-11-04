import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { rotinaDoDia } from "@/lib/data/rotina-diaria";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { hojeBahia, lerRelatorio, prazoDoRelatorio } from "./dados";

// Relógio no alto do sistema (Rotinas v2, 30/10): leva à rotina da própria
// pessoa e acende um alerta quando uma tarefa fixa passou da hora sem ser
// marcada, ou quando faltam 2 h (ou menos) para o prazo do relatório do dia e ele
// não foi enviado (prazo: equipe 18:00, admin máximo 23:59; 04/11/2026).

export type AlertaRotina = { href: string; atrasadas: number; relatorioPendente: boolean } | null;


export async function alertaDaRotina(profileId: string): Promise<AlertaRotina> {
  const eu = await responsavelDoPerfil(profileId);
  if (!eu) return null;
  const adm = createAdminClient() as unknown as SupabaseClient;
  const hoje = hojeBahia();
  const [itens, { data: resp }] = await Promise.all([rotinaDoDia(eu, hoje, adm), adm.from("responsaveis").select("rotina_modelo_id").eq("id", eu).maybeSingle()]);
  const temModelo = !!resp?.rotina_modelo_id;
  // sem rotina montada ainda (caso do Maurício até criar a dele): o relógio aparece igual e leva à página de Rotinas, sem alerta
  if (!itens.length && !temModelo) return { href: "/admin/rotinas", atrasadas: 0, relatorioPendente: false };
  const atrasadas = itens.filter((i) => !i.feito && i.situacao === "atrasado").length;
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", hour: "2-digit", hour12: false }).format(new Date()));
  let relatorioPendente = false;
  if (temModelo && hora >= (await prazoDoRelatorio(eu)).hora - 2) relatorioPendente = (await lerRelatorio(eu, hoje))?.status !== "enviado";
  return { href: `/admin/rotinas?pessoa=${eu}`, atrasadas, relatorioPendente };
}
