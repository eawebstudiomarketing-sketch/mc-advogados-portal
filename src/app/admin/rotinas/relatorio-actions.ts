"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehSuperAdmin, requireRole } from "@/lib/dal";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { aprovarRelatorio, atribuirModelo, editarRelatorioEnviado, enviarRelatorio, excluirModelo, hojeBahia, salvarModelo, salvarRascunho, type PerguntaEditavel } from "@/lib/rotina-relatorio/dados";
import { enviarRelatorioDoDia, MAURICIO } from "@/lib/rotina-relatorio/dia";
import { avisarRelatorioAtrasado } from "@/lib/rotina-relatorio/atraso";
import type { Valor } from "@/lib/rotina-relatorio/tipos";
import { salvarRegras } from "@/lib/rotina-relatorio/regras";
import { criarAvisos } from "@/lib/avisos";

// Ações do relatório do dia (Rotinas v2). Modelos: só o admin máximo.
// Preencher e enviar: cada pessoa, só o próprio relatório, só no dia de hoje.

type Resultado = { ok: true } | { ok: false; error: string };
const msg = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir. Tente de novo.");

async function exigirSuper() {
  const profile = await requireRole(["admin"]);
  if (!ehSuperAdmin(profile)) throw new Error("Só o administrador máximo monta os modelos.");
}

export async function salvarModeloAction(input: { id?: string | null; nome: string; aprovadorId?: string | null; perguntas: PerguntaEditavel[] }): Promise<Resultado & { id?: string }> {
  try {
    await exigirSuper();
    const id = await salvarModelo(input);
    revalidatePath("/admin/rotinas");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function excluirModeloAction(id: string): Promise<Resultado> {
  try {
    await exigirSuper();
    await excluirModelo(id);
    revalidatePath("/admin/rotinas");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function atribuirModeloAction(responsavelId: string, modeloId: string | null): Promise<Resultado> {
  try {
    await exigirSuper();
    await atribuirModelo(responsavelId, modeloId);
    revalidatePath("/admin/rotinas");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

async function minhaPessoa(): Promise<string> {
  const profile = await requireRole(["admin", "advogado"]);
  const eu = await responsavelDoPerfil(profile.id);
  if (!eu) throw new Error("Seu usuário não está ligado a um responsável.");
  return eu;
}

export async function salvarRascunhoAction(respostas: Record<string, Valor>, justificativas: Record<string, string>): Promise<Resultado> {
  try {
    await salvarRascunho(await minhaPessoa(), hojeBahia(), respostas, justificativas);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function enviarRelatorioAction(respostas: Record<string, Valor>, justificativas: Record<string, string>): Promise<Resultado & { faltas?: string[] }> {
  try {
    const eu = await minhaPessoa();
    const dia = hojeBahia();
    const faltas = await enviarRelatorio(eu, dia, respostas, justificativas);
    if (faltas.length) return { ok: false, error: `Ainda falta: ${faltas.join("; ")}.`, faltas };
    // o relatório de dono: quando o Maurício envia o dele, o resumo do dia (HTML) vai para o Zap dele
    const enviadoEm = new Date();
    after(async () => {
      // da equipe depois do limite: avisa o Maurício (portal e/ou Zap, conforme as Regras)
      await avisarRelatorioAtrasado(eu, dia, enviadoEm).catch(() => false);
      const { data } = await (createAdminClient() as unknown as import("@supabase/supabase-js").SupabaseClient).from("responsaveis").select("profile_id").eq("id", eu).maybeSingle();
      if (data?.profile_id === MAURICIO) await enviarRelatorioDoDia(dia, { forcar: true }).catch(() => undefined);
    });
    revalidatePath("/admin/rotinas");
    revalidatePath("/admin", "layout"); // some o aviso do prazo no topo e a bolinha do relógio
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/** Regras da rotina (06/11/2026): só o admin máximo. A agenda das 8h no Zap é a chave rotina_ativa que já existia. */
export async function salvarRegrasAction(regras: unknown, agendaZap: boolean): Promise<Resultado> {
  try {
    await exigirSuper();
    await salvarRegras(regras);
    await createAdminClient().from("escritorio_config").update({ rotina_ativa: agendaZap, updated_at: new Date().toISOString() }).eq("id", 1);
    revalidatePath("/admin", "layout"); // relógio, faixa do topo e textos do prazo
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/** O admin máximo aprova o relatório de uma pessoa: nota de 0 a 10 e comentário opcional. */
export async function aprovarRelatorioAction(responsavelId: string, dia: string, nota: number, comentario: string): Promise<Resultado> {
  try {
    const profile = await requireRole(["admin"]);
    if (!ehSuperAdmin(profile)) throw new Error("Só o administrador máximo aprova os relatórios.");
    await aprovarRelatorio(responsavelId, dia, nota, comentario, profile.id);
    revalidatePath("/admin/rotinas");
    revalidatePath("/admin/painel");
    revalidatePath("/admin/indicadores");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/** Só o admin máximo pode corrigir um relatório já enviado (se a pessoa explicar algo depois). */
export async function editarRelatorioAction(responsavelId: string, dia: string, respostas: Record<string, Valor>, justificativas: Record<string, string>): Promise<Resultado> {
  try {
    const profile = await requireRole(["admin"]);
    if (!ehSuperAdmin(profile)) throw new Error("Só o administrador máximo edita um relatório enviado.");
    await editarRelatorioEnviado(responsavelId, dia, respostas, justificativas, profile.id);
    revalidatePath("/admin/rotinas");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/** Exclui a rotina de uma pessoa: desativa as tarefas fixas e tira o modelo de relatório (o histórico fica). */
export async function excluirRotinaAction(responsavelId: string): Promise<Resultado> {
  try {
    await exigirSuper();
    const db = createAdminClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
    const [a, b] = await Promise.all([
      db.from("rotina_itens").update({ ativo: false }).eq("responsavel_id", responsavelId),
      db.from("responsaveis").update({ rotina_modelo_id: null }).eq("id", responsavelId),
    ]);
    if (a.error || b.error) throw new Error("Não foi possível excluir a rotina. Tente de novo.");
    revalidatePath("/admin/rotinas");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

/**
 * Justificativa → editar (10/11/2026, pedido do usuário): o Maurício lê a
 * justificativa de uma demanda vencida no relatório, abre a atividade ali mesmo,
 * edita e salva; a advogada responsável recebe um aviso (sininho + celular).
 */
export async function avisarAtividadeEditadaAction(activityId: string): Promise<Resultado & { nome?: string | null }> {
  try {
    const eu = await requireRole(["admin"]);
    if (!/^[0-9a-f-]{36}$/i.test(activityId)) throw new Error("Atividade inválida.");
    const db = createAdminClient();
    const { data: a } = await db.from("activities").select("id, title, responsavel_id").eq("id", activityId).maybeSingle();
    if (!a?.responsavel_id) return { ok: true, nome: null };
    const { data: r } = await db.from("responsaveis").select("nome, profile_id").eq("id", a.responsavel_id).maybeSingle();
    if (!r?.profile_id || r.profile_id === eu.id) return { ok: true, nome: null };
    const quem = eu.full_name?.split(" ")[0] || "O administrador";
    await criarAvisos([
      {
        profile_id: r.profile_id,
        tipo: "atividade_editada",
        titulo: `${quem} ajustou uma atividade sua`,
        corpo: `${a.title} — depois de ler sua justificativa no relatório. Confira o que mudou.`,
        url: `/admin/activities/${a.id}`,
      },
    ]);
    return { ok: true, nome: r.nome?.split(" ")[0] ?? null };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
