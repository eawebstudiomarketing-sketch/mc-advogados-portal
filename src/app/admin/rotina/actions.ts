"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { exigirSuperAdmin, requireRole } from "@/lib/dal";
import { hojeBahia } from "@/lib/periodo";

// Rotina diária: a pessoa marca o que fez hoje (vale ponto no ranking); o
// admin máximo define os itens de cada pessoa. As regras do banco (0030)
// garantem que cada um só marca o próprio.

const UUID = /^[0-9a-f-]{36}$/i;
const db = async () => (await createClient()) as unknown as SupabaseClient;

export async function marcarRotinaAction(itemId: string, feito: boolean): Promise<{ ok: boolean; erro?: string }> {
  await requireRole(["admin", "advogado"]);
  if (!UUID.test(itemId)) return { ok: false, erro: "Item inválido." };
  const d = await db();
  const dia = hojeBahia();
  const { data: item } = await d.from("rotina_itens").select("responsavel_id").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, erro: "Item não encontrado." };
  const { error } = feito
    ? await d.from("rotina_feitos").upsert({ item_id: itemId, responsavel_id: item.responsavel_id, dia }, { onConflict: "item_id,dia" })
    : await d.from("rotina_feitos").delete().eq("item_id", itemId).eq("dia", dia);
  if (error) return { ok: false, erro: "Só a própria pessoa marca a rotina dela." };
  revalidatePath("/admin");
  return { ok: true };
}

const DIAS_VALIDOS = (dias: number[]) => [...new Set(dias.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();

export async function salvarItemRotinaAction(
  item: { id?: string; responsavelId: string; titulo: string; dias: number[] }
): Promise<{ ok: boolean; erro?: string; id?: string }> {
  await exigirSuperAdmin();
  const titulo = item.titulo.trim().slice(0, 140);
  const dias = DIAS_VALIDOS(item.dias);
  if (!titulo) return { ok: false, erro: "Escreva o item da rotina." };
  if (!dias.length) return { ok: false, erro: "Escolha pelo menos um dia." };
  const d = await db();
  if (item.id) {
    if (!UUID.test(item.id)) return { ok: false, erro: "Item inválido." };
    const { error } = await d.from("rotina_itens").update({ titulo, dias }).eq("id", item.id);
    if (error) return { ok: false, erro: "Não foi possível salvar." };
    revalidatePath("/admin/team");
    return { ok: true, id: item.id };
  }
  if (!UUID.test(item.responsavelId)) return { ok: false, erro: "Pessoa inválida." };
  const { count } = await d.from("rotina_itens").select("id", { count: "exact", head: true }).eq("responsavel_id", item.responsavelId);
  const { data, error } = await d.from("rotina_itens").insert({ responsavel_id: item.responsavelId, titulo, dias, ordem: count ?? 0 }).select("id").single();
  if (error || !data) return { ok: false, erro: "Não foi possível criar o item." };
  revalidatePath("/admin/team");
  return { ok: true, id: data.id };
}

export async function excluirItemRotinaAction(id: string): Promise<{ ok: boolean; erro?: string }> {
  await exigirSuperAdmin();
  if (!UUID.test(id)) return { ok: false, erro: "Item inválido." };
  // some da rotina; os pontos já ganhos com ele continuam (desativa em vez de apagar)
  const { error } = await (await db()).from("rotina_itens").update({ ativo: false }).eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir." };
  revalidatePath("/admin/team");
  return { ok: true };
}
