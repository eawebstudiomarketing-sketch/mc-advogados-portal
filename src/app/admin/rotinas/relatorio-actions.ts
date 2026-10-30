"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehSuperAdmin, requireRole } from "@/lib/dal";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { aprovarRelatorio, atribuirModelo, editarRelatorioEnviado, enviarRelatorio, excluirModelo, hojeBahia, salvarModelo, salvarRascunho, type PerguntaEditavel } from "@/lib/rotina-relatorio/dados";
import { enviarRelatorioDoDia, MAURICIO } from "@/lib/rotina-relatorio/dia";
import type { Valor } from "@/lib/rotina-relatorio/tipos";

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
    after(async () => {
      const { data } = await (createAdminClient() as unknown as import("@supabase/supabase-js").SupabaseClient).from("responsaveis").select("profile_id").eq("id", eu).maybeSingle();
      if (data?.profile_id === MAURICIO) await enviarRelatorioDoDia(dia, { forcar: true }).catch(() => undefined);
    });
    revalidatePath("/admin/rotinas");
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
