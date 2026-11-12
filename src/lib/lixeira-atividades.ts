import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { restoreBatch, TRASH_DAYS } from "@/lib/trash";

// Lixeira de atividades (12/11/2026, migration 0076). Antes de excluir, guarda
// a atividade e tudo o que está ligado a ela; "Restaurar" devolve do jeito que
// estava. Sem a tabela (migration ainda não rodada), exclui como antes.

// apagadas junto com a atividade (on delete cascade): guarda as linhas inteiras
const FILHOS = ["activity_comments", "activity_deadline_alerts", "cobrancas_documentos", "prazo_pedidos"] as const;
// só perdem a ligação (on delete set null): guarda os ids para religar
const LIGACOES = ["publicacoes", "andamentos", "distribuicao", "onboarding_demand_drafts", "marca_prazos", "zap_agendamentos"] as const;

type Dados = {
  activity: Record<string, unknown>;
  filhos: Record<string, Record<string, unknown>[]>;
  ligacoes: Record<string, string[]>;
  documentos: string[];
};

const db = () => createAdminClient() as unknown as SupabaseClient;

let tabelaExiste: boolean | null = null;
async function temLixeira(): Promise<boolean> {
  if (tabelaExiste !== null) return tabelaExiste;
  const { error } = await db().from("activities_trash").select("id", { head: true, count: "exact" }).limit(1);
  tabelaExiste = !error;
  return tabelaExiste;
}

/** Exclui as atividades guardando cópia na Lixeira por 30 dias. Devolve quantas saíram. */
export async function excluirAtividades(ids: string[], por: string | null): Promise<{ excluidas: number; erro: string | null }> {
  if (!ids.length) return { excluidas: 0, erro: null };
  const c = db();
  if (await temLixeira()) {
    const { data: ativs } = await c.from("activities").select("*").in("id", ids);
    for (const a of (ativs ?? []) as Record<string, unknown>[]) {
      const id = String(a.id);
      const filhos: Dados["filhos"] = {};
      const ligacoes: Dados["ligacoes"] = {};
      await Promise.all([
        ...FILHOS.map(async (t) => {
          const { data } = await c.from(t).select("*").eq("activity_id", id);
          if (data?.length) filhos[t] = data;
        }),
        ...LIGACOES.map(async (t) => {
          const { data } = await c.from(t).select("id").eq("activity_id", id);
          if (data?.length) ligacoes[t] = data.map((x) => String(x.id));
        }),
      ]);
      const { data: docs } = await c.from("documents").select("id").eq("activity_id", id);
      const dados: Dados = { activity: a, filhos, ligacoes, documentos: (docs ?? []).map((d) => String(d.id)) };
      const { error } = await c
        .from("activities_trash")
        .upsert({ id, title: String(a.title ?? "Atividade"), client_id: (a.client_id as string | null) ?? null, dados, deleted_by: por, deleted_at: new Date().toISOString() });
      if (error) return { excluidas: 0, erro: "Não foi possível guardar na Lixeira. Nada foi excluído." };
    }
  }
  const { data, error } = await c.from("activities").delete().in("id", ids).select("id");
  if (error) {
    // não excluiu: tira a cópia que acabou de entrar na lixeira
    if (tabelaExiste) await c.from("activities_trash").delete().in("id", ids);
    return { excluidas: 0, erro: "Não foi possível excluir. Tente novamente." };
  }
  return { excluidas: data?.length ?? 0, erro: null };
}

export type AtividadeNaLixeira = { id: string; title: string; client_id: string | null; deleted_at: string; deleted_by: string | null };

export async function listarLixeiraAtividades(): Promise<AtividadeNaLixeira[] | null> {
  if (!(await temLixeira())) return null;
  const c = db();
  // passou de 30 dias: sai de vez
  await c.from("activities_trash").delete().lt("deleted_at", new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString());
  const { data } = await c.from("activities_trash").select("id, title, client_id, deleted_at, deleted_by").order("deleted_at", { ascending: false }).limit(500);
  return (data ?? []) as AtividadeNaLixeira[];
}

/** Devolve a atividade da Lixeira com comentários, anexos e ligações. */
export async function restaurarAtividade(id: string): Promise<string | null> {
  const c = db();
  const { data: linha } = await c.from("activities_trash").select("dados").eq("id", id).maybeSingle();
  if (!linha) return "Essa atividade não está mais na Lixeira.";
  const d = linha.dados as Dados;
  const a = { ...d.activity };
  // o cliente ou o responsável podem ter sido excluídos nesse meio-tempo
  if (a.client_id) {
    const { data: cli } = await c.from("clients").select("id").eq("id", a.client_id).maybeSingle();
    if (!cli) a.client_id = null;
  }
  const { error } = await c.from("activities").insert(a);
  if (error) {
    console.error("restaurar atividade", error);
    return "Não foi possível restaurar. Tente novamente.";
  }
  for (const [t, linhas] of Object.entries(d.filhos ?? {})) {
    const { error: e } = await c.from(t).upsert(linhas);
    if (e) console.error(`restaurar ${t}`, e.message);
  }
  for (const [t, ids] of Object.entries(d.ligacoes ?? {})) {
    if (ids.length) await c.from(t).update({ activity_id: id }).in("id", ids).is("activity_id", null);
  }
  // anexos: saíram junto (cascata) e estão na Lixeira de documentos; voltam também
  if (d.documentos?.length) {
    const { data: lotes } = await c.from("documents_trash").select("batch_id").in("id", d.documentos);
    for (const b of new Set((lotes ?? []).map((x) => String(x.batch_id)))) await restoreBatch(b).catch(() => undefined);
  }
  await c.from("activities_trash").delete().eq("id", id);
  return null;
}
