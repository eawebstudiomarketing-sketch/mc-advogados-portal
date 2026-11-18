import "server-only";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeBahia } from "@/lib/periodo";
import { MAURICIO } from "./dia";
import { modeloDaPessoa } from "./dados";
import { ehDiaDeRelatorio, lerRegras } from "./regras";

// Bloqueio por relatório faltando (18/11/2026, pedido do Maurício no grupo Sistemas e IA):
// "Se a pessoa esquecer de preencher o relatório do dia, deixar registrado uma advertência
// naquele mês, e ela não consegue mexer no sistema até preencher o relatório do dia anterior
// que ficou faltando."
// - Vale para quem tem modelo de relatório (rotina) e não é o admin máximo.
// - Olha o último dia de relatório antes de hoje (pelas Regras: dias da semana e feriados).
// - Só conta a partir de INICIO: ninguém fica preso por dias antes da regra existir.
// - A advertência não precisa de tabela: é todo dia de relatório do mês que não foi enviado
//   no próprio dia (ficou faltando ou só foi enviado depois).

export const INICIO_BLOQUEIO = "2026-11-18";

const db = () => createAdminClient() as unknown as SupabaseClient;

const menosDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const diaBahia = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(iso));

/** O último dia de relatório antes de hoje (até 10 dias para trás). */
async function diaAnteriorDeRelatorio(hoje: string): Promise<string | null> {
  const regras = await lerRegras();
  for (let i = 1; i <= 10; i++) {
    const d = menosDias(hoje, i);
    if (ehDiaDeRelatorio(d, regras)) return d;
  }
  return null;
}

export type Pendencia = { responsavelId: string; dia: string; advertenciasNoMes: number };

/** O relatório que está faltando e trava o portal desta pessoa (null = livre). */
export const relatorioPendente = cache(async (profileId: string): Promise<Pendencia | null> => {
  if (profileId === MAURICIO) return null;
  const { data: resp } = await db()
    .from("responsaveis")
    .select("id, created_at, profiles!responsaveis_profile_id_fkey(role, super_admin, oculto)")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!resp) return null;
  const p = resp.profiles as unknown as { role: string; super_admin: boolean | null; oculto: boolean | null } | null;
  if (p?.role === "admin" && p.super_admin) return null;
  const hoje = hojeBahia();
  const dia = await diaAnteriorDeRelatorio(hoje);
  // conta oculta de teste (arch.teste.*): sem data inicial, para dar para testar em produção
  if (!dia || (dia < INICIO_BLOQUEIO && !p?.oculto)) return null;
  // pessoa que entrou depois desse dia não deve aquele relatório
  if (resp.created_at && diaBahia(resp.created_at as string) > dia) return null;
  if (!(await modeloDaPessoa(resp.id as string))) return null;
  const { data: rel } = await db().from("rotina_relatorios").select("status").eq("responsavel_id", resp.id).eq("dia", dia).maybeSingle();
  if (rel?.status === "enviado") return null;
  return { responsavelId: resp.id as string, dia, advertenciasNoMes: await advertenciasNoMes(resp.id as string, hoje.slice(0, 7)) };
});

/**
 * Advertências da pessoa no mês ("2026-11"): dias de relatório já passados (desde INICIO) sem
 * relatório enviado no próprio dia. O de hoje só conta amanhã.
 */
export async function advertenciasNoMes(responsavelId: string, mes: string): Promise<number> {
  return (await diasComAdvertencia(responsavelId, mes)).length;
}

export async function diasComAdvertencia(responsavelId: string, mes: string): Promise<string[]> {
  const hoje = hojeBahia();
  const regras = await lerRegras();
  const ini = `${mes}-01` < INICIO_BLOQUEIO ? INICIO_BLOQUEIO : `${mes}-01`;
  const dias: string[] = [];
  for (let d = ini; d < hoje && d.startsWith(mes); d = menosDias(d, -1)) if (ehDiaDeRelatorio(d, regras)) dias.push(d);
  if (!dias.length) return [];
  const { data } = await db().from("rotina_relatorios").select("dia, status, enviado_em").eq("responsavel_id", responsavelId).in("dia", dias);
  const noDia = new Set(
    ((data ?? []) as { dia: string; status: string; enviado_em: string | null }[]).filter((r) => r.status === "enviado" && r.enviado_em && diaBahia(r.enviado_em) === r.dia).map((r) => r.dia)
  );
  return dias.filter((d) => !noDia.has(d));
}
