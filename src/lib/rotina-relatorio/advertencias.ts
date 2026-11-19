import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeBahia } from "@/lib/periodo";
import { MAURICIO } from "./dia";
import { INICIO_BLOQUEIO } from "./bloqueio";
import { ehDiaDeRelatorio, lerRegras } from "./regras";

// Advertências SALVAS (19/11/2026, pedido do João): toda vez que a pessoa não envia o relatório
// no dia, fica gravada uma advertência em rotina_advertencias (migration 0079). Antes era só
// calculada na hora. Uma vez gravada, não some (nem se as Regras mudarem); só o enviado_em é
// atualizado quando o relatório atrasado chega.
// - Painel do Dono → Advertências: todas, de todo mundo (só o admin máximo).
// - Indicadores: cada pessoa vê as suas.
// - Grava sozinho no cron da madrugada (relatorio-rotina) e sempre que alguém abre essas telas.
// - Sem a tabela (0079 não rodada), as telas mostram o cálculo na hora, sem gravar.

export type Advertencia = { responsavelId: string; nome: string; foto: string | null; dia: string; enviadoEm: string | null; criadaEm: string | null };

const db = () => createAdminClient() as unknown as SupabaseClient;
const maisDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaBahia = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(iso));
const semTabela = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /rotina_advertencias/.test(e.message ?? ""));

type Pessoa = { id: string; nome: string; foto: string | null; desde: string };

/** Quem deve relatório: tem modelo, não é o Maurício nem o admin máximo, nem conta oculta/inativa. */
async function pessoasComRelatorio(): Promise<Pessoa[]> {
  const { data } = await db()
    .from("responsaveis")
    .select("id, nome, foto_url, created_at, profile_id, profiles!responsaveis_profile_id_fkey(role, super_admin, oculto, ativo)")
    .not("rotina_modelo_id", "is", null);
  return ((data ?? []) as unknown as { id: string; nome: string; foto_url: string | null; created_at: string | null; profile_id: string | null; profiles: { role: string; super_admin: boolean | null; oculto: boolean | null; ativo: boolean | null } | null }[])
    .filter((r) => r.profile_id && r.profile_id !== MAURICIO && r.profiles && !(r.profiles.role === "admin" && r.profiles.super_admin) && !r.profiles.oculto && r.profiles.ativo !== false)
    .map((r) => ({ id: r.id, nome: r.nome, foto: r.foto_url, desde: r.created_at ? diaBahia(r.created_at) : INICIO_BLOQUEIO }));
}

/** Calcula as advertências desde INICIO até ontem (relatório não enviado no próprio dia). */
async function calcular(pessoas: Pessoa[]): Promise<Advertencia[]> {
  if (!pessoas.length) return [];
  const hoje = hojeBahia();
  const regras = await lerRegras();
  const dias: string[] = [];
  for (let d = INICIO_BLOQUEIO; d < hoje; d = maisDias(d, 1)) if (ehDiaDeRelatorio(d, regras)) dias.push(d);
  if (!dias.length) return [];
  const rels: { responsavel_id: string; dia: string; status: string; enviado_em: string | null }[] = [];
  for (let a = 0; ; a += 1000) {
    const { data } = await db()
      .from("rotina_relatorios")
      .select("responsavel_id, dia, status, enviado_em")
      .in("responsavel_id", pessoas.map((p) => p.id))
      .gte("dia", INICIO_BLOQUEIO)
      .range(a, a + 999);
    rels.push(...((data ?? []) as typeof rels));
    if ((data ?? []).length < 1000) break;
  }
  const porChave = new Map(rels.map((r) => [`${r.responsavel_id}|${r.dia}`, r]));
  const out: Advertencia[] = [];
  for (const p of pessoas)
    for (const d of dias) {
      if (d < p.desde) continue; // entrou depois desse dia
      const r = porChave.get(`${p.id}|${d}`);
      const enviado = r?.status === "enviado" && r.enviado_em ? r.enviado_em : null;
      if (enviado && diaBahia(enviado) === d) continue; // enviou no dia: sem advertência
      out.push({ responsavelId: p.id, nome: p.nome, foto: p.foto, dia: d, enviadoEm: enviado, criadaEm: null });
    }
  return out;
}

/** Grava (ou atualiza o enviado_em de) as advertências calculadas. Devolve false se a tabela não existe. */
export async function registrarAdvertencias(): Promise<{ tabela: boolean; calculadas: Advertencia[]; pessoas: Pessoa[] }> {
  const pessoas = await pessoasComRelatorio();
  const calculadas = await calcular(pessoas);
  if (!calculadas.length) {
    const { error } = await db().from("rotina_advertencias").select("id").limit(1);
    return { tabela: !semTabela(error), calculadas, pessoas };
  }
  const { error } = await db()
    .from("rotina_advertencias")
    .upsert(
      calculadas.map((a) => ({ responsavel_id: a.responsavelId, dia: a.dia, enviado_em: a.enviadoEm })),
      { onConflict: "responsavel_id,dia" }
    );
  if (error && !semTabela(error)) console.error("[advertencias] gravar:", error.message);
  return { tabela: !semTabela(error), calculadas, pessoas };
}

/** Todas as advertências gravadas (ou só de uma pessoa), da mais nova para a mais antiga. */
export async function listarAdvertencias(responsavelId?: string): Promise<{ itens: Advertencia[]; salvas: boolean }> {
  const { tabela, calculadas } = await registrarAdvertencias();
  if (!tabela) {
    const itens = calculadas.filter((a) => !responsavelId || a.responsavelId === responsavelId).sort((a, b) => b.dia.localeCompare(a.dia) || a.nome.localeCompare(b.nome));
    return { itens, salvas: false };
  }
  let q = db().from("rotina_advertencias").select("responsavel_id, dia, enviado_em, criada_em, responsaveis(nome, foto_url)").order("dia", { ascending: false });
  if (responsavelId) q = q.eq("responsavel_id", responsavelId);
  const { data, error } = await q.limit(2000);
  if (error) return { itens: calculadas.filter((a) => !responsavelId || a.responsavelId === responsavelId), salvas: false };
  const itens = ((data ?? []) as unknown as { responsavel_id: string; dia: string; enviado_em: string | null; criada_em: string; responsaveis: { nome: string; foto_url: string | null } | null }[]).map((r) => ({
    responsavelId: r.responsavel_id,
    nome: r.responsaveis?.nome ?? "—",
    foto: r.responsaveis?.foto_url ?? null,
    dia: r.dia,
    enviadoEm: r.enviado_em,
    criadaEm: r.criada_em,
  }));
  return { itens: itens.sort((a, b) => b.dia.localeCompare(a.dia) || a.nome.localeCompare(b.nome)), salvas: true };
}
