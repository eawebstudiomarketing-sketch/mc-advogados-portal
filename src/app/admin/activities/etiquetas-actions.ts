"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import type { Etiqueta } from "@/lib/data/etiquetas";

const UUID = /^[0-9a-f-]{36}$/i;
const COR = /^#[0-9a-f]{6}$/i;
// cores das etiquetas novas (a próxima livre, em rodízio)
const PALETA = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#db2777", "#0d9488", "#ea580c", "#0891b2", "#4f46e5", "#b8892f", "#475569"];

export type ResultadoEtiqueta = { ok: true; etiqueta: Etiqueta } | { ok: false; error: string };

export async function criarEtiquetaAction(nome: string): Promise<ResultadoEtiqueta> {
  await exigirPermissao("atividades");
  const limpo = nome.trim().slice(0, 60);
  if (!limpo) return { ok: false, error: "Escreva o nome da etiqueta." };
  const supabase = await createClient();
  const { data: existente } = await supabase.from("etiquetas").select("id, nome, cor").ilike("nome", limpo).maybeSingle();
  if (existente) return { ok: true, etiqueta: existente };
  const { count } = await supabase.from("etiquetas").select("id", { count: "exact", head: true });
  const { data, error } = await supabase
    .from("etiquetas")
    .insert({ nome: limpo, cor: PALETA[(count ?? 0) % PALETA.length] })
    .select("id, nome, cor")
    .single();
  if (error || !data) return { ok: false, error: "Não foi possível criar a etiqueta." };
  revalidatePath("/admin/activities");
  return { ok: true, etiqueta: data };
}

/** Troca as etiquetas de uma atividade (a qualquer momento, sem abrir a edição). */
export async function setEtiquetasAction(activityId: string, ids: string[]): Promise<{ ok: boolean; error?: string }> {
  await exigirPermissao("atividades");
  if (!UUID.test(activityId)) return { ok: false, error: "Atividade inválida." };
  const limpos = [...new Set(ids.filter((i) => UUID.test(i)))];
  const { error } = await (await createClient()).from("activities").update({ etiquetas: limpos }).eq("id", activityId);
  if (error) return { ok: false, error: "Não foi possível salvar as etiquetas." };
  revalidatePath("/admin/activities");
  return { ok: true };
}

export async function editarEtiquetaAction(id: string, nome: string, cor: string): Promise<{ ok: boolean; error?: string }> {
  await exigirPermissao("atividades");
  const limpo = nome.trim().slice(0, 60);
  if (!UUID.test(id) || !limpo || !COR.test(cor)) return { ok: false, error: "Nome ou cor inválidos." };
  const { error } = await (await createClient()).from("etiquetas").update({ nome: limpo, cor }).eq("id", id);
  if (error) return { ok: false, error: error.code === "23505" ? "Já existe uma etiqueta com esse nome." : "Não foi possível salvar." };
  revalidatePath("/admin/activities");
  return { ok: true };
}

/** Exclui a etiqueta e tira ela das atividades que a usavam. */
export async function excluirEtiquetaAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await exigirPermissao("atividades", "excluir");
  if (!UUID.test(id)) return { ok: false, error: "Etiqueta inválida." };
  const supabase = await createClient();
  const { data: usando } = await supabase.from("activities").select("id, etiquetas").contains("etiquetas", [id]);
  for (const a of usando ?? []) {
    await supabase.from("activities").update({ etiquetas: (a.etiquetas ?? []).filter((e) => e !== id) }).eq("id", a.id);
  }
  const { error } = await supabase.from("etiquetas").delete().eq("id", id);
  if (error) return { ok: false, error: "Não foi possível excluir." };
  revalidatePath("/admin/activities");
  return { ok: true };
}
