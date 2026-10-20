import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Rotina diária de cada pessoa (definida pelo admin máximo). Cada item tem os
// dias da semana em que aparece; a pessoa marca o que fez no dia e cada item
// feito vale 1 ponto no ranking (igual a uma demanda concluída).

export type ItemRotina = { id: string; responsavel_id: string; titulo: string; dias: number[]; ordem: number; ativo: boolean };
export type ItemDoDia = ItemRotina & { feito: boolean; feitoEm: string | null };

// tabelas da migration 0030 (fora do types.ts gerado)
type Db = SupabaseClient;
const banco = async (db?: Db) => db ?? ((await createClient()) as unknown as Db);

const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();

/** Itens (ativos) de várias pessoas, ou de todas. */
export async function listarItensRotina(responsavelIds?: string[], db?: Db): Promise<ItemRotina[]> {
  let q = (await banco(db)).from("rotina_itens").select("id, responsavel_id, titulo, dias, ordem, ativo").eq("ativo", true).order("ordem").order("created_at");
  if (responsavelIds) q = q.in("responsavel_id", responsavelIds.length ? responsavelIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  return (data ?? []) as ItemRotina[];
}

/** Rotina de uma pessoa num dia (só os itens daquele dia da semana), com o que já foi feito. */
export async function rotinaDoDia(responsavelId: string, dia: string, db?: Db): Promise<ItemDoDia[]> {
  const d = await banco(db);
  const semana = diaDaSemana(dia);
  const [itens, { data: feitos }] = await Promise.all([
    listarItensRotina([responsavelId], d),
    d.from("rotina_feitos").select("item_id, feito_em").eq("responsavel_id", responsavelId).eq("dia", dia),
  ]);
  const feitoEm = new Map((feitos ?? []).map((f) => [f.item_id as string, f.feito_em as string]));
  return itens.filter((i) => i.dias.includes(semana)).map((i) => ({ ...i, feito: feitoEm.has(i.id), feitoEm: feitoEm.get(i.id) ?? null }));
}

/** Itens de rotina feitos por pessoa desde um dia (pontos do ranking). */
export async function pontosDeRotina(desde: string, db?: Db): Promise<Map<string, number>> {
  const { data } = await (await banco(db)).from("rotina_feitos").select("responsavel_id").gte("dia", desde);
  const m = new Map<string, number>();
  for (const f of data ?? []) m.set(f.responsavel_id, (m.get(f.responsavel_id) ?? 0) + 1);
  return m;
}

/** Progresso de hoje de cada pessoa: feitos / total. */
export async function progressoDoDia(dia: string, db?: Db): Promise<Map<string, { feitos: number; total: number }>> {
  const d = await banco(db);
  const semana = diaDaSemana(dia);
  const [itens, { data: feitos }] = await Promise.all([listarItensRotina(undefined, d), d.from("rotina_feitos").select("item_id, responsavel_id").eq("dia", dia)]);
  const m = new Map<string, { feitos: number; total: number }>();
  const doDia = new Set<string>();
  for (const i of itens) {
    if (!i.dias.includes(semana)) continue;
    doDia.add(i.id);
    const p = m.get(i.responsavel_id) ?? { feitos: 0, total: 0 };
    p.total++;
    m.set(i.responsavel_id, p);
  }
  for (const f of feitos ?? []) if (doDia.has(f.item_id)) m.get(f.responsavel_id)!.feitos++;
  return m;
}
