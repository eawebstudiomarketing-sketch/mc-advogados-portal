"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import { anexosDaAtividade, atividadeVisivel, linkDeEnvio, registrarAnexo, removerAnexo, type Anexo } from "@/lib/anexos-atividade";

// Anexos da atividade (06/11/2026): o navegador pede um link, manda o arquivo
// direto ao Storage e depois registra. Ver lib/anexos-atividade.ts.

type Erro = { ok: false; error: string };
const msg = (e: unknown) => (e instanceof Error ? e.message : "Não foi possível concluir. Tente de novo.");

/** Link de envio. Sem `activityId`: atividade ainda sendo criada (o arquivo espera numa pasta da pessoa). */
export async function linkAnexoAction(activityId: string | null, nome: string, interno: boolean): Promise<{ ok: true; caminho: string; token: string } | Erro> {
  try {
    const profile = await requireRole(["admin", "advogado"]);
    if (!activityId) return { ok: true, ...(await linkDeEnvio({ pendente: profile.id }, nome)) };
    const atividade = await atividadeVisivel(activityId);
    if (!atividade) return { ok: false, error: "Atividade não encontrada." };
    return { ok: true, ...(await linkDeEnvio({ atividade, interno }, nome)) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function registrarAnexoAction(activityId: string, caminho: string, nome: string, interno: boolean): Promise<{ ok: true; anexos: Anexo[] } | Erro> {
  try {
    const profile = await requireRole(["admin", "advogado"]);
    const atividade = await atividadeVisivel(activityId);
    if (!atividade) return { ok: false, error: "Atividade não encontrada." };
    await registrarAnexo({ atividade, caminho, nome, interno, profileId: profile.id });
    revalidatePath(`/admin/activities/${activityId}`);
    return { ok: true, anexos: await anexosDaAtividade(activityId, profile.id) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function removerAnexoAction(activityId: string, docId: string): Promise<{ ok: true; anexos: Anexo[] } | Erro> {
  try {
    const profile = await requireRole(["admin", "advogado"]);
    if (!(await atividadeVisivel(activityId))) return { ok: false, error: "Atividade não encontrada." };
    await removerAnexo(activityId, docId, profile.id, profile.role === "admin");
    revalidatePath(`/admin/activities/${activityId}`);
    return { ok: true, anexos: await anexosDaAtividade(activityId, profile.id) };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}
