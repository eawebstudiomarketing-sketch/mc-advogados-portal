"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { exigirSuperAdmin, requireRole } from "@/lib/dal";
import { hojeBahia } from "@/lib/periodo";
import { checklistValido, regraValida, type RegraMensal, type SubitemRotina } from "@/lib/rotina-repeticao";

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
  repeticao?: "semanal" | "mensal";
  regraMensal?: RegraMensal | null;
  checklist?: SubitemRotina[];
}): Promise<{ ok: boolean; erro?: string; id?: string }> {
  await exigirSuperAdmin();
  const titulo = item.titulo.trim().slice(0, 140);
  const dias = DIAS_VALIDOS(item.dias);
  const repeticao = item.repeticao === "mensal" ? "mensal" : "semanal";
  const regra_mensal = repeticao === "mensal" ? regraValida(item.regraMensal) : null;
  if (!titulo) return { ok: false, erro: "Escreva o item da rotina." };
  if (repeticao === "semanal" && !dias.length) return { ok: false, erro: "Escolha pelo menos um dia." };
  if (repeticao === "mensal" && !regra_mensal) return { ok: false, erro: "Escolha quando no mês." };
  const hora_inicio = item.horaInicio && HORA.test(item.horaInicio) ? item.horaInicio : null;
  const hora_fim = hora_inicio && item.horaFim && HORA.test(item.horaFim) && item.horaFim > hora_inicio ? item.horaFim : null;
  if (item.horaFim && hora_inicio && item.horaFim <= hora_inicio) return { ok: false, erro: "O fim precisa ser depois do início." };
  const observacao = item.observacao?.trim().slice(0, 1000) || null;
  const campos = { titulo, dias: dias.length ? dias : [1, 2, 3, 4, 5], hora_inicio, hora_fim, observacao, repeticao, regra_mensal, ...(item.checklist ? { checklist: checklistValido(item.checklist) } : {}) };
  const d = await db();
  if (item.id) {
    if (!UUID.test(item.id)) return { ok: false, erro: "Item inválido." };
    const { error } = await d.from("rotina_itens").update(campos).eq("id", item.id);
    if (error) return { ok: false, erro: "Não foi possível salvar." };
    revalidatePath("/admin/rotinas");
    return { ok: true, id: item.id };
  }
  if (!UUID.test(item.responsavelId)) return { ok: false, erro: "Pessoa inválida." };
  // item novo entra no fim da lista de prioridade
  const { data: ultimo } = await d.from("rotina_itens").select("ordem").eq("responsavel_id", item.responsavelId).order("ordem", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await d.from("rotina_itens").insert({ responsavel_id: item.responsavelId, ...campos, ordem: (ultimo?.ordem ?? -1) + 1 }).select("id").single();
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
  const { data: itens } = await d.from("rotina_itens").select("titulo, dias, hora_inicio, hora_fim, observacao, ordem, checklist, repeticao, regra_mensal").eq("responsavel_id", de).eq("ativo", true);
  if (!itens?.length) return { ok: false, erro: "Essa pessoa ainda não tem rotina." };
  const { error } = await d.from("rotina_itens").insert(itens.map((i) => ({ ...i, responsavel_id: para })));
  if (error) return { ok: false, erro: "Não foi possível copiar." };
  revalidatePath("/admin/rotinas");
  return { ok: true, copiados: itens.length };
}

/** Sobe ou desce uma tarefa fixa na ordem de prioridade (a rotina do dia segue essa ordem). */
export async function moverItemRotinaAction(id: string, direcao: "subir" | "descer"): Promise<{ ok: boolean; erro?: string }> {
  await exigirSuperAdmin();
  if (!UUID.test(id)) return { ok: false, erro: "Item inválido." };
  const d = await db();
  const { data: item } = await d.from("rotina_itens").select("responsavel_id").eq("id", id).maybeSingle();
  if (!item) return { ok: false, erro: "Item não encontrado." };
  const { data: lista } = await d.from("rotina_itens").select("id").eq("responsavel_id", item.responsavel_id).eq("ativo", true).order("ordem").order("created_at");
  const ids = (lista ?? []).map((x) => x.id as string);
  const i = ids.indexOf(id);
  const j = direcao === "subir" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  // renumera a lista toda (0, 1, 2…): poucos itens por pessoa
  const erros = await Promise.all(ids.map((x, n) => d.from("rotina_itens").update({ ordem: n }).eq("id", x)));
  if (erros.some((r) => r.error)) return { ok: false, erro: "Não foi possível mudar a ordem." };
  revalidatePath("/admin/rotinas");
  return { ok: true };
}

/**
 * Marca/desmarca um subitem do checklist da tarefa fixa hoje. Quando todos os
 * subitens ficam marcados, a tarefa se marca sozinha (vale o ponto).
 */
export async function marcarSubitemRotinaAction(itemId: string, subId: string, feito: boolean): Promise<{ ok: boolean; erro?: string; itemFeito?: boolean }> {
  await requireRole(["admin", "advogado"]);
  if (!UUID.test(itemId) || !subId || subId.length > 60) return { ok: false, erro: "Item inválido." };
  const d = await db();
  const dia = hojeBahia();
  const { data: item } = await d.from("rotina_itens").select("responsavel_id, checklist").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, erro: "Item não encontrado." };
  const { error } = feito
    ? await d.from("rotina_subitens_feitos").upsert({ item_id: itemId, sub_id: subId, responsavel_id: item.responsavel_id, dia }, { onConflict: "item_id,sub_id,dia" })
    : await d.from("rotina_subitens_feitos").delete().eq("item_id", itemId).eq("sub_id", subId).eq("dia", dia);
  if (error) return { ok: false, erro: "Só a própria pessoa marca a rotina dela." };
  let itemFeito = false;
  if (feito) {
    const subs = checklistValido(item.checklist).map((x) => x.id);
    const { data: marcados } = await d.from("rotina_subitens_feitos").select("sub_id").eq("item_id", itemId).eq("dia", dia);
    const set = new Set((marcados ?? []).map((x) => x.sub_id as string));
    if (subs.length && subs.every((x) => set.has(x))) {
      await d.from("rotina_feitos").upsert({ item_id: itemId, responsavel_id: item.responsavel_id, dia }, { onConflict: "item_id,dia" });
      itemFeito = true;
    }
  }
  revalidatePath("/admin");
  revalidatePath("/admin/rotinas");
  return { ok: true, itemFeito };
}
