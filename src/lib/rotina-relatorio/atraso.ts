import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarAvisos } from "@/lib/avisos";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { MAURICIO } from "./dia";
import { prazoDoRelatorio } from "./dados";
import { enviadoComAtraso } from "./tipos";

// Relatório com atraso (05/11/2026, pedido do João): a equipe pode enviar até
// 23:59, mas o que chega depois das 18:00 avisa o Maurício no portal (sininho
// + celular) e no WhatsApp dele.

const db = () => createAdminClient() as unknown as SupabaseClient;
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br";
const horaBr = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" }).format(d);

export async function avisarRelatorioAtrasado(responsavelId: string, dia: string, enviadoEm = new Date()): Promise<boolean> {
  const prazo = await prazoDoRelatorio(responsavelId);
  if (!enviadoComAtraso(enviadoEm.toISOString(), prazo.hora)) return false;
  const [{ data: pessoa }, { data: dono }] = await Promise.all([
    db().from("responsaveis").select("nome, profile_id").eq("id", responsavelId).maybeSingle(),
    db().from("responsaveis").select("telefone").eq("profile_id", MAURICIO).maybeSingle(),
  ]);
  if (!pessoa || pessoa.profile_id === MAURICIO) return false;
  const nome = String(pessoa.nome);
  const quando = horaBr(enviadoEm);
  const url = "/admin/rotinas";
  await criarAvisos([
    { profile_id: MAURICIO, tipo: "relatorio_atrasado", titulo: `⏰ ${nome} enviou o relatório com atraso`, corpo: `Enviado às ${quando} (prazo ${prazo.texto}).`, url },
  ]);
  const tel = String(dono?.telefone ?? "").replace(/\D/g, "");
  if (tel.length >= 10) {
    await enfileirarMensagem({
      para: tel,
      texto: `*Relatório do dia com atraso*\n${nome} enviou o relatório de hoje às *${quando}* (o prazo é ${prazo.texto}).\n\nLer e aprovar: ${SITE}${url}`,
      origemRef: `relatorio-atrasado:${responsavelId}:${dia}`,
    }).catch(() => null);
  }
  return true;
}
