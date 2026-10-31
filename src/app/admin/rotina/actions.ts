"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { exigirSuperAdmin, requireRole } from "@/lib/dal";
import { hojeBahia } from "@/lib/periodo";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { rotinaDoDia } from "@/lib/data/rotina-diaria";
import type { ItemRotinaTela } from "@/components/rotina/minha-rotina";

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
  revalidatePath("/admin/rotinas");
  return { ok: true };
}

const DIAS_VALIDOS = (dias: number[]) => [...new Set(dias.filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort();

const HORA = /^\d{2}:\d{2}$/;

export async function salvarItemRotinaAction(item: {
  id?: string;
  responsavelId: string;
  titulo: string;
  dias: number[];
  horaInicio?: string | null;
  horaFim?: string | null;
  observacao?: string | null;
}): Promise<{ ok: boolean; erro?: string; id?: string }> {
  await exigirSuperAdmin();
  const titulo = item.titulo.trim().slice(0, 140);
  const dias = DIAS_VALIDOS(item.dias);
  if (!titulo) return { ok: false, erro: "Escreva o item da rotina." };
  if (!dias.length) return { ok: false, erro: "Escolha pelo menos um dia." };
  const hora_inicio = item.horaInicio && HORA.test(item.horaInicio) ? item.horaInicio : null;
  const hora_fim = hora_inicio && item.horaFim && HORA.test(item.horaFim) && item.horaFim > hora_inicio ? item.horaFim : null;
  if (item.horaFim && hora_inicio && item.horaFim <= hora_inicio) return { ok: false, erro: "O fim precisa ser depois do início." };
  const observacao = item.observacao?.trim().slice(0, 1000) || null;
  const campos = { titulo, dias, hora_inicio, hora_fim, observacao };
  const d = await db();
  if (item.id) {
    if (!UUID.test(item.id)) return { ok: false, erro: "Item inválido." };
    const { error } = await d.from("rotina_itens").update(campos).eq("id", item.id);
    if (error) return { ok: false, erro: "Não foi possível salvar." };
    revalidatePath("/admin/rotinas");
    return { ok: true, id: item.id };
  }
  if (!UUID.test(item.responsavelId)) return { ok: false, erro: "Pessoa inválida." };
  const { count } = await d.from("rotina_itens").select("id", { count: "exact", head: true }).eq("responsavel_id", item.responsavelId);
  const { data, error } = await d.from("rotina_itens").insert({ responsavel_id: item.responsavelId, ...campos, ordem: count ?? 0 }).select("id").single();
  if (error || !data) return { ok: false, erro: "Não foi possível criar o item." };
  revalidatePath("/admin/rotinas");
  return { ok: true, id: data.id };
}

export async function excluirItemRotinaAction(id: string): Promise<{ ok: boolean; erro?: string }> {
  await exigirSuperAdmin();
  if (!UUID.test(id)) return { ok: false, erro: "Item inválido." };
  // some da rotina; os pontos já ganhos com ele continuam (desativa em vez de apagar)
  const { error } = await (await db()).from("rotina_itens").update({ ativo: false }).eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir." };
  revalidatePath("/admin/rotinas");
  return { ok: true };
}

/** Copia a rotina inteira de uma pessoa para outra (soma aos itens que ela já tem). */
export async function copiarRotinaAction(de: string, para: string): Promise<{ ok: boolean; erro?: string; copiados?: number }> {
  await exigirSuperAdmin();
  if (!UUID.test(de) || !UUID.test(para) || de === para) return { ok: false, erro: "Escolha duas pessoas diferentes." };
  const d = await db();
  const { data: itens } = await d.from("rotina_itens").select("titulo, dias, hora_inicio, hora_fim, observacao, ordem").eq("responsavel_id", de).eq("ativo", true);
  if (!itens?.length) return { ok: false, erro: "Essa pessoa ainda não tem rotina." };
  const { error } = await d.from("rotina_itens").insert(itens.map((i) => ({ ...i, responsavel_id: para })));
  if (error) return { ok: false, erro: "Não foi possível copiar." };
  revalidatePath("/admin/rotinas");
  return { ok: true, copiados: itens.length };
}

/** Rotina de hoje de quem está logado (cartão do reloginho do topo, em qualquer tela). */
export async function minhaRotinaHojeAction(): Promise<ItemRotinaTela[]> {
  const profile = await requireRole(["admin", "advogado"]);
  const eu = await responsavelDoPerfil(profile.id);
  if (!eu) return [];
  const itens = await rotinaDoDia(eu, hojeBahia());
  return itens.map((i) => ({ id: i.id, titulo: i.titulo, feito: i.feito, feitoEm: i.feitoEm, hora_inicio: i.hora_inicio, hora_fim: i.hora_fim, observacao: i.observacao, situacao: i.situacao }));
}
