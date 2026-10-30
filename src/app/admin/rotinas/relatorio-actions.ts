"use server";

import { revalidatePath } from "next/cache";
import { ehSuperAdmin, requireRole } from "@/lib/dal";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { atribuirModelo, enviarRelatorio, excluirModelo, hojeBahia, salvarModelo, salvarRascunho, type PerguntaEditavel } from "@/lib/rotina-relatorio/dados";
import type { Valor } from "@/lib/rotina-relatorio/tipos";

// Ações do relatório do dia (Rotinas v2). Modelos: só o admin máximo.
// Preencher e enviar: cada pessoa, só o próprio relatório, só no dia de hoje.

type Resultado = { ok: true } | { ok: false; error: string };
const msg = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir. Tente de novo.");

async function exigirSuper() {
  const profile = await requireRole(["admin"]);
  if (!ehSuperAdmin(profile)) throw new Error("Só o administrador máximo monta os modelos.");
}

export async function salvarModeloAction(input: { id?: string | null; nome: string; perguntas: PerguntaEditavel[] }): Promise<Resultado & { id?: string }> {
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
    const faltas = await enviarRelatorio(await minhaPessoa(), hojeBahia(), respostas, justificativas);
    if (faltas.length) return { ok: false, error: `Ainda falta: ${faltas.join("; ")}.`, faltas };
    revalidatePath("/admin/rotinas");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
