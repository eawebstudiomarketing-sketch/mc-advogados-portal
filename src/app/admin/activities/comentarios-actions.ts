"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/dal";
import { criarAvisos } from "@/lib/avisos";

// Comentários das atividades (só equipe; o cliente nunca vê). Quem pode ver a
// atividade pode comentar (regras do banco, migration 0022). Marcar alguém com
// @Nome manda aviso pra pessoa; o responsável e quem já comentou também são
// avisados.

export type Comentario = {
  id: string;
  autor_id: string;
  autor: string;
  texto: string;
  created_at: string;
  editado_em: string | null;
};
export type Membro = { id: string; nome: string };

async function equipe(): Promise<Membro[]> {
  const db = await createClient();
  const { data } = await db.from("profiles").select("id, full_name").in("role", ["admin", "advogado"]).eq("ativo", true).order("full_name");
  return (data ?? []).map((p) => ({ id: p.id, nome: p.full_name }));
}

export async function listarComentariosAction(
  activityId: string
): Promise<{ ok: true; meuId: string; equipe: Membro[]; comentarios: Comentario[] } | { ok: false; error: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const db = await createClient();
  const [{ data, error }, membros] = await Promise.all([
    db.from("activity_comments").select("id, autor_id, texto, created_at, editado_em").eq("activity_id", activityId).order("created_at"),
    equipe(),
  ]);
  if (error) return { ok: false, error: "Não foi possível carregar os comentários." };
  // nome de quem comentou (inclusive quem saiu da equipe)
  const ids = [...new Set((data ?? []).map((c) => c.autor_id))].filter((id) => !membros.some((m) => m.id === id));
  const extras = ids.length ? (await createAdminClient().from("profiles").select("id, full_name").in("id", ids)).data ?? [] : [];
  const nome = new Map([...membros.map((m) => [m.id, m.nome] as const), ...extras.map((p) => [p.id, p.full_name] as const)]);
  return {
    ok: true,
    meuId: profile.id,
    equipe: membros,
    comentarios: (data ?? []).map((c) => ({ ...c, autor: nome.get(c.autor_id) ?? "Alguém da equipe" })),
  };
}

/** Quem foi marcado: "@Nome Completo" (ou só o primeiro nome, se for único) no texto. */
function mencionados(texto: string, membros: Membro[]): string[] {
  const t = texto.toLowerCase();
  const out = new Set<string>();
  for (const m of membros) {
    if (t.includes(`@${m.nome.toLowerCase()}`)) out.add(m.id);
  }
  for (const m of membros) {
    const primeiro = m.nome.split(" ")[0]!.toLowerCase();
    const unico = membros.filter((x) => x.nome.split(" ")[0]!.toLowerCase() === primeiro).length === 1;
    if (unico && new RegExp(`@${primeiro.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(t)) out.add(m.id);
  }
  return [...out];
}

export async function comentarAction(activityId: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const limpo = texto.trim().slice(0, 5000);
  if (!limpo) return { ok: false, error: "Escreva o comentário." };
  const db = await createClient();
  const membros = await equipe();
  const mencoes = mencionados(limpo, membros);
  const { error } = await db.from("activity_comments").insert({ activity_id: activityId, autor_id: profile.id, texto: limpo, mencoes });
  if (error) return { ok: false, error: "Não foi possível comentar (você ainda tem acesso a esta atividade?)." };

  // avisos: marcados + responsável + quem já comentou (menos quem escreveu)
  const adm = createAdminClient();
  const [{ data: atv }, { data: anteriores }] = await Promise.all([
    adm.from("activities").select("title, responsaveis(profile_id)").eq("id", activityId).maybeSingle(),
    adm.from("activity_comments").select("autor_id").eq("activity_id", activityId),
  ]);
  const titulo = atv?.title ?? "uma atividade";
  const resp = (atv?.responsaveis as { profile_id: string | null } | null)?.profile_id ?? null;
  const url = `/admin/activities/${activityId}`;
  const primeiroNome = profile.full_name.split(" ")[0];
  const trecho = limpo.length > 140 ? `${limpo.slice(0, 137)}…` : limpo;
  const marcados = mencoes.filter((id) => id !== profile.id);
  const acompanham = [...new Set([resp, ...(anteriores ?? []).map((c) => c.autor_id)])].filter(
    (id): id is string => !!id && id !== profile.id && !marcados.includes(id)
  );
  await criarAvisos([
    ...marcados.map((id) => ({ profile_id: id, tipo: "mencao", titulo: `${primeiroNome} marcou você em "${titulo}"`, corpo: trecho, url })),
    ...acompanham.map((id) => ({ profile_id: id, tipo: "comentario", titulo: `${primeiroNome} comentou em "${titulo}"`, corpo: trecho, url })),
  ]);
  return { ok: true };
}

export async function editarComentarioAction(id: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "advogado"]);
  const limpo = texto.trim().slice(0, 5000);
  if (!limpo) return { ok: false, error: "O comentário não pode ficar vazio." };
  const db = await createClient();
  const { error } = await db.from("activity_comments").update({ texto: limpo, editado_em: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Só quem escreveu pode editar." } : { ok: true };
}

export async function apagarComentarioAction(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireRole(["admin", "advogado"]);
  const db = await createClient();
  const { error } = await db.from("activity_comments").delete().eq("id", id);
  return error ? { ok: false, error: "Não foi possível apagar." } : { ok: true };
}
