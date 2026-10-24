"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirSuperAdmin } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { gerarSugestoes, vezesRefeitasHoje } from "@/lib/painel/sugestao";
import { relatorioDoGerente, type Gerente } from "@/lib/painel/gerente";

const LIMITE_POR_DIA = 3; // gasto mínimo: cada "gerar de novo" é 1 chamada barata

export async function refazerSugestoesAction(): Promise<{ error?: string }> {
  await exigirSuperAdmin();
  if ((await vezesRefeitasHoje()) >= LIMITE_POR_DIA) return { error: `Já foi gerada de novo ${LIMITE_POR_DIA} vezes hoje. Amanhã às 7h sai a nova.` };
  const r = await gerarSugestoes({ refazer: true });
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/painel");
  return {};
}

/** Relatório do gerente (cache; "atualizar" só refaz se o guardado tiver 10+ min). */
export async function gerenteAction(periodoId: string, atualizar = false): Promise<{ gerente?: Gerente; error?: string }> {
  await exigirSuperAdmin();
  let r = await relatorioDoGerente(periodoId);
  if (r.ok && atualizar && Date.now() - Date.parse(r.gerente.geradoEm) > 10 * 60_000) r = await relatorioDoGerente(periodoId, { forcar: true });
  return r.ok ? { gerente: r.gerente } : { error: r.error };
}

/** Sugestão de redistribuição aceita: passa a atividade para outra pessoa. */
export async function reatribuirAction(activityId: string, responsavelId: string): Promise<{ error?: string }> {
  await exigirSuperAdmin();
  // com o login de quem clicou (a auditoria registra a pessoa)
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: r } = await db.from("responsaveis").select("id, profile_id").eq("id", responsavelId).maybeSingle();
  if (!r) return { error: "Responsável não encontrado." };
  const { error } = await db
    .from("activities")
    .update(r.profile_id ? { responsavel_id: r.id, responsible_id: r.profile_id } : { responsavel_id: r.id })
    .eq("id", activityId);
  if (error) return { error: error.message };
  revalidatePath("/admin/painel");
  revalidatePath("/admin/activities");
  return {};
}

/* ───────── ações do gerente (sempre depois da confirmação na tela) ───────── */

export type PedidoAcao =
  | { tipo: "marcar_reuniao"; clienteId: string; titulo: string; inicio: string; duracaoMin: number; responsavelId: string | null; mensagem: string; destino: string | null; enviar: boolean }
  | { tipo: "responder"; chatJid: string; texto: string }
  | { tipo: "alertar"; pessoas: { profileId: string; telefone: string | null }[]; titulo: string; corpo: string; url: string; zap: boolean }
  | { tipo: "concluir"; activityId: string }
  | { tipo: "mover_prazos"; ids: string[]; novaData: string }
  | { tipo: "lembrar_assinatura"; ids: string[] }
  | { tipo: "reatribuir"; activityId: string; paraId: string };

export async function executarAcaoAction(p: PedidoAcao): Promise<{ ok?: string; error?: string }> {
  const perfil = await exigirSuperAdmin();
  const cliente = (await createClient()) as unknown as SupabaseClient;
  const acoes = await import("@/lib/painel/acoes");
  try {
    let ok: string;
    switch (p.tipo) {
      case "marcar_reuniao":
        ok = await acoes.marcarReuniao(p, perfil.id, cliente);
        break;
      case "responder":
        ok = await acoes.enviarResposta(p, perfil.id);
        break;
      case "alertar":
        ok = await acoes.alertar(p, perfil.id);
        break;
      case "concluir":
        ok = await acoes.concluir(p, cliente);
        break;
      case "mover_prazos":
        ok = await acoes.moverPrazos(p, cliente);
        break;
      case "lembrar_assinatura":
        ok = await acoes.lembrarAssinaturas(p);
        break;
      case "reatribuir": {
        const r = await reatribuirAction(p.activityId, p.paraId);
        if (r.error) throw new Error(r.error);
        ok = "Atividade passada.";
        break;
      }
    }
    revalidatePath("/admin/painel");
    return { ok };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível concluir a ação." };
  }
}

/** Rascunho de resposta ao cliente (IA só quando clicam em "responder"). */
export async function rascunhoRespostaAction(chatJid: string): Promise<{ texto?: string; error?: string }> {
  await exigirSuperAdmin();
  const { rascunhoResposta } = await import("@/lib/painel/acoes");
  try {
    return { texto: await rascunhoResposta(chatJid) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível escrever o rascunho." };
  }
}
