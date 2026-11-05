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

/** Aviso fixo no topo na ÚLTIMA hora antes do prazo (05/11/2026: equipe das 17h às 18h). O navegador decide pela hora. */
export type AvisoPrazo = { prazoHora: number; prazoTexto: string; tarefasFaltando: number };
export type AlertaRotina = { href: string; atrasadas: number; relatorioPendente: boolean; aviso: AvisoPrazo | null } | null;


export async function alertaDaRotina(profileId: string): Promise<AlertaRotina> {
  const eu = await responsavelDoPerfil(profileId);
  if (!eu) return null;
  const adm = createAdminClient() as unknown as SupabaseClient;
  const hoje = hojeBahia();
  const [itens, { data: resp }] = await Promise.all([rotinaDoDia(eu, hoje, adm), adm.from("responsaveis").select("rotina_modelo_id").eq("id", eu).maybeSingle()]);
  const temModelo = !!resp?.rotina_modelo_id;
  // sem rotina montada ainda (caso do Maurício até criar a dele): o relógio aparece igual e leva à página de Rotinas, sem alerta
  if (!itens.length && !temModelo) return { href: "/admin/rotinas", atrasadas: 0, relatorioPendente: false, aviso: null };
  const atrasadas = itens.filter((i) => !i.feito && i.situacao === "atrasado").length;
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", hour: "2-digit", hour12: false }).format(new Date()));
  const prazo = await prazoDoRelatorio(eu);
  const enviado = !temModelo || (await lerRelatorio(eu, hoje))?.status === "enviado";
  const relatorioPendente = !enviado && hora >= prazo.hora - 2;
  const aviso = enviado ? null : { prazoHora: prazo.hora, prazoTexto: prazo.texto, tarefasFaltando: itens.filter((i) => !i.feito).length };
  return { href: `/admin/rotinas?pessoa=${eu}`, atrasadas, relatorioPendente, aviso };
}
