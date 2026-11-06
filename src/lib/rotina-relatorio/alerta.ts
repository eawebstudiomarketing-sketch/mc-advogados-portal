import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { rotinaDoDia } from "@/lib/data/rotina-diaria";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { hojeBahia, lerRelatorio, prazoDoRelatorio } from "./dados";
import { minutoBahia } from "./regras-base";

// Relógio no alto do sistema (Rotinas v2, 30/10): leva à rotina da própria
// pessoa e acende um alerta quando uma tarefa fixa passou da hora sem ser
// marcada, ou quando o prazo do relatório do dia está perto e ele não foi enviado
// (quanto antes e o prazo: Regras da rotina, 06/11/2026; admin máximo 23:59).

/**
 * Aviso fixo no topo antes do limite (05/11/2026; 06/11: quanto tempo antes vem
 * das Regras da rotina). O navegador decide pela hora.
 */
export type AvisoPrazo = { prazoMin: number; prazoTexto: string; antesMin: number; fecha: boolean; avisaDono: boolean; tarefasFaltando: number };
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
  const prazo = await prazoDoRelatorio(eu);
  // dia sem relatório (fim de semana, feriado… conforme as Regras): sem alerta do relatório
  const enviado = !temModelo || !prazo.temRelatorioHoje || (await lerRelatorio(eu, hoje))?.status === "enviado";
  const relatorioPendente = !enviado && minutoBahia(new Date()) >= prazo.min - prazo.regras.relogioVermelhoMin;
  const aviso = enviado
    ? null
    : { prazoMin: prazo.min, prazoTexto: prazo.texto, antesMin: prazo.regras.avisoTopoMin, fecha: prazo.fecha, avisaDono: prazo.regras.avisarAtraso !== "nenhum", tarefasFaltando: itens.filter((i) => !i.feito).length };
  return { href: `/admin/rotinas?pessoa=${eu}`, atrasadas, relatorioPendente, aviso };
}
