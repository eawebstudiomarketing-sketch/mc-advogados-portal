import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { caiNoDia, type RegraMensal, type SubitemRotina } from "@/lib/rotina-repeticao";

// Rotina diária de cada pessoa (definida pelo admin máximo): itens com horário
// (início/fim, opcionais), repetição (dias da semana ou regra mensal),
// observação e checklist. A pessoa marca o que fez no dia; cada item feito vale
// 1 ponto no ranking, mesmo se atrasado (o atraso só aparece no relatório do
// Maurício). A ordem dos itens é a prioridade que o admin máximo define (03/11).

export type ItemRotina = {
  id: string;
  responsavel_id: string;
  titulo: string;
  dias: number[];
  ordem: number;
  ativo: boolean;
  hora_inicio: string | null; // "HH:MM:SS"
  hora_fim: string | null;
  observacao: string | null;
  checklist: SubitemRotina[];
  repeticao: "semanal" | "mensal";
  regra_mensal: RegraMensal | null;
  created_at?: string;
};
export type SituacaoItem = "feito" | "agora" | "atrasado" | "depois" | "sem_hora";
export type ItemDoDia = ItemRotina & { feito: boolean; feitoEm: string | null; situacao: SituacaoItem; subFeitos: string[] };

// tabelas das migrations 0030/0032/0065 (fora do types.ts gerado)
type Db = SupabaseClient;
const banco = async (db?: Db) => db ?? ((await createClient()) as unknown as Db);

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
const agoraBahia = () => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const horaBahia = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

/** Ordem do dia: a prioridade definida pelo admin máximo (setas ↑↓ no editor). */
const porPrioridade = (a: ItemRotina, b: ItemRotina) => a.ordem - b.ordem || (a.created_at ?? "").localeCompare(b.created_at ?? "");

/** Limite do item: o fim; sem fim, 1 h depois do início. */
function limite(i: ItemRotina): string | null {
  if (i.hora_fim) return hhmm(i.hora_fim);
  if (!i.hora_inicio) return null;
  const [h, m] = i.hora_inicio.split(":").map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Itens (ativos) de várias pessoas, ou de todas. */
export async function listarItensRotina(responsavelIds?: string[], db?: Db): Promise<ItemRotina[]> {
  let q = (await banco(db))
    .from("rotina_itens")
    .select("id, responsavel_id, titulo, dias, ordem, ativo, hora_inicio, hora_fim, observacao, checklist, repeticao, regra_mensal, created_at")
    .eq("ativo", true)
    .order("ordem")
    .order("created_at");
  if (responsavelIds) q = q.in("responsavel_id", responsavelIds.length ? responsavelIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  return ((data ?? []) as ItemRotina[]).map((i) => ({ ...i, checklist: i.checklist ?? [], repeticao: i.repeticao ?? "semanal" })).sort(porPrioridade);
}

/** Rotina de uma pessoa num dia (só os itens que caem nele), com o que já foi feito, os subitens marcados e a situação agora. */
export async function rotinaDoDia(responsavelId: string, dia: string, db?: Db): Promise<ItemDoDia[]> {
  const d = await banco(db);
  const [itens, { data: feitos }, { data: subs }] = await Promise.all([
    listarItensRotina([responsavelId], d),
    d.from("rotina_feitos").select("item_id, feito_em").eq("responsavel_id", responsavelId).eq("dia", dia),
    d.from("rotina_subitens_feitos").select("item_id, sub_id").eq("responsavel_id", responsavelId).eq("dia", dia),
  ]);
  const feitoEm = new Map((feitos ?? []).map((f) => [f.item_id as string, f.feito_em as string]));
  const subFeitos = (id: string) => (subs ?? []).filter((x) => x.item_id === id).map((x) => x.sub_id as string);
  const hoje = hojeBahia();
  const agora = agoraBahia();
  return itens
    .filter((i) => caiNoDia(i, dia))
    .map((i) => {
      const feito = feitoEm.has(i.id);
      const ini = hhmm(i.hora_inicio);
      const lim = limite(i);
      const situacao: SituacaoItem = feito
        ? "feito"
        : !ini
          ? "sem_hora"
          : dia < hoje || (dia === hoje && lim && agora > lim)
            ? "atrasado"
            : dia === hoje && agora >= ini
              ? "agora"
              : "depois";
      return { ...i, feito, feitoEm: feitoEm.get(i.id) ?? null, situacao, subFeitos: subFeitos(i.id) };
    });
}

/** Itens da pessoa que não caem neste dia (para mostrar a semana/o mês no cartão). */
export async function rotinaOutrosDias(responsavelId: string, dia: string, db?: Db): Promise<ItemRotina[]> {
  return (await listarItensRotina([responsavelId], db)).filter((i) => !caiNoDia(i, dia));
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
  const [itens, { data: feitos }] = await Promise.all([listarItensRotina(undefined, d), d.from("rotina_feitos").select("item_id, responsavel_id").eq("dia", dia)]);
  const m = new Map<string, { feitos: number; total: number }>();
  const doDia = new Set<string>();
  for (const i of itens) {
    if (!caiNoDia(i, dia)) continue;
    doDia.add(i.id);
    const p = m.get(i.responsavel_id) ?? { feitos: 0, total: 0 };
    p.total++;
    m.set(i.responsavel_id, p);
  }
  for (const f of feitos ?? []) if (doDia.has(f.item_id)) m.get(f.responsavel_id)!.feitos++;
  return m;
}

export type Cumprimento = { esperados: number; feitos: number; noHorario: number };

/**
 * Cumprimento de cada pessoa num período (até hoje): quantos itens eram
 * esperados (pela repetição de cada item ativo), quantos foram feitos e
 * quantos foram marcados até o horário-limite do item.
 */
export async function cumprimento(desde: string, ate: string, db?: Db): Promise<Map<string, Cumprimento>> {
  const d = await banco(db);
  const [itens, { data: feitos }] = await Promise.all([
    listarItensRotina(undefined, d),
    d.from("rotina_feitos").select("item_id, responsavel_id, dia, feito_em").gte("dia", desde).lte("dia", ate),
  ]);
  const porId = new Map(itens.map((i) => [i.id, i]));
  const m = new Map<string, Cumprimento>();
  const pega = (r: string) => {
    if (!m.has(r)) m.set(r, { esperados: 0, feitos: 0, noHorario: 0 });
    return m.get(r)!;
  };
  // só conta a partir do dia em que o item foi criado
  for (let dia = desde; dia <= ate; dia = proximoDia(dia)) {
    for (const i of itens) if (caiNoDia(i, dia) && dia >= criadoEm(i)) pega(i.responsavel_id).esperados++;
  }
  for (const f of feitos ?? []) {
    const c = pega(f.responsavel_id);
    c.feitos++;
    const i = porId.get(f.item_id);
    const lim = i ? limite(i) : null;
    const noDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(f.feito_em)) === f.dia;
    if (!lim || (noDia && horaBahia(f.feito_em) <= lim)) c.noHorario++;
  }
  return m;
}

function proximoDia(dia: string) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export type LinhaRelatorio = { item: ItemRotina; feitoEm: string | null; noHorario: boolean | null; passou: boolean };

/** Relatório de um dia: para cada pessoa, cada item esperado com feito/não feito e se foi no horário. */
export async function relatorioDoDia(dia: string, db?: Db): Promise<Map<string, LinhaRelatorio[]>> {
  const d = await banco(db);
  const [itens, { data: feitos }] = await Promise.all([listarItensRotina(undefined, d), d.from("rotina_feitos").select("item_id, feito_em").eq("dia", dia)]);
  const feitoEm = new Map((feitos ?? []).map((f) => [f.item_id as string, f.feito_em as string]));
  const m = new Map<string, LinhaRelatorio[]>();
  for (const i of itens) {
    if (!caiNoDia(i, dia) || dia < criadoEm(i)) continue;
    const quando = feitoEm.get(i.id) ?? null;
    const lim = limite(i);
    const noHorario = quando ? !lim || horaBahia(quando) <= lim : null;
    const passou = !quando && (dia < hojeBahia() || (dia === hojeBahia() && !!lim && agoraBahia() > lim));
    m.set(i.responsavel_id, [...(m.get(i.responsavel_id) ?? []), { item: i, feitoEm: quando, noHorario, passou }]);
  }
  return m;
}

const criadoEm = (i: ItemRotina) => (i.created_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(i.created_at)) : "0000-00-00");
