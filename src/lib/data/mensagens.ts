import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

// Mensagens internas da equipe (migration 0022). Conversa = "geral" (canal
// Escritório, todo mundo) ou "dm:<idA>:<idB>" com os ids em ordem.

export type ChatMensagem = Database["public"]["Tables"]["chat_mensagens"]["Row"];
export type Aviso = Database["public"]["Tables"]["avisos"]["Row"];
export type Pessoa = { id: string; nome: string; role: string };
export type ResumoConversa = { conversa: string; ultima: ChatMensagem | null; naoLidas: number };

export const GERAL = "geral";
export const conversaCom = (eu: string, outro: string) => `dm:${[eu, outro].sort().join(":")}`;
export const outroDaConversa = (conversa: string, eu: string) =>
  conversa.startsWith("dm:") ? conversa.slice(3).split(":").find((id) => id !== eu) ?? null : null;

/** Equipe que aparece nas conversas (menos a própria pessoa). */
export async function listarEquipe(eu: string): Promise<Pessoa[]> {
  const db = await createClient();
  const { data } = await db.from("profiles").select("id, full_name, role").in("role", ["admin", "advogado"]).eq("ativo", true).order("full_name");
  return (data ?? []).filter((p) => p.id !== eu).map((p) => ({ id: p.id, nome: p.full_name, role: p.role }));
}

/** Última mensagem e não lidas de cada conversa da pessoa. */
export async function resumoDasConversas(eu: string, equipe: Pessoa[]): Promise<ResumoConversa[]> {
  const db = await createClient();
  const conversas = [GERAL, ...equipe.map((p) => conversaCom(eu, p.id))];
  const { data: leituras } = await db.from("chat_leituras").select("conversa, lido_em").eq("profile_id", eu);
  const lido = new Map((leituras ?? []).map((l) => [l.conversa, l.lido_em]));
  return Promise.all(
    conversas.map(async (conversa) => {
      const [{ data: ultima }, { count }] = await Promise.all([
        db.from("chat_mensagens").select("*").eq("conversa", conversa).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db
          .from("chat_mensagens")
          .select("id", { count: "exact", head: true })
          .eq("conversa", conversa)
          .neq("autor_id", eu)
          .gt("created_at", lido.get(conversa) ?? "1970-01-01"),
      ]);
      return { conversa, ultima: ultima ?? null, naoLidas: count ?? 0 };
    })
  );
}

export async function lerMensagens(conversa: string, antesDe?: string): Promise<ChatMensagem[]> {
  const db = await createClient();
  let q = db.from("chat_mensagens").select("*").eq("conversa", conversa).order("created_at", { ascending: false }).limit(80);
  if (antesDe) q = q.lt("created_at", antesDe);
  const { data } = await q;
  return (data ?? []).reverse();
}

export async function listarAvisos(eu: string): Promise<Aviso[]> {
  const db = await createClient();
  const { data } = await db.from("avisos").select("*").eq("profile_id", eu).order("created_at", { ascending: false }).limit(60);
  return data ?? [];
}

/** Total pro número no menu: mensagens não lidas + avisos não lidos. */
export async function contarNaoLidas(eu: string): Promise<number> {
  const db = await createClient();
  const equipe = await listarEquipe(eu);
  const [resumo, { count }] = await Promise.all([
    resumoDasConversas(eu, equipe),
    db.from("avisos").select("id", { count: "exact", head: true }).eq("profile_id", eu).is("lido_em", null),
  ]);
  return resumo.reduce((s, r) => s + r.naoLidas, 0) + (count ?? 0);
}
