"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao, getPermissoes, requireRole } from "@/lib/dal";
import { getActivity } from "@/lib/data/activities";
import { nomeResponsavel } from "@/lib/responsavel-nome";
import { listEtiquetas, type Etiqueta } from "@/lib/data/etiquetas";
import { listDocuments } from "@/lib/data/documents";
import { listResponsaveis, type Responsavel } from "@/lib/data/responsaveis";
import type { Database } from "@/lib/supabase/types";

// Ações da mini tela da atividade (abre por cima de qualquer lista/quadro).

export type AtividadeDetalhe = {
  id: string;
  title: string;
  description: string | null;
  type: Database["public"]["Enums"]["activity_type"];
  status: Database["public"]["Enums"]["activity_status"];
  deadline: string | null;
  hora: string | null;
  created_at: string;
  archived_at: string | null;
  cliente_avisado_em: string | null;
  client_id: string;
  cliente: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  envolvidos: string[];
  etiquetas: string[];
  etiquetasTodas: Etiqueta[];
  documentos: { id: string; title: string; created_at: string; downloadUrl: string | null; drive_file_id: string | null }[];
  /** Documentos do cliente que ainda não estão nesta atividade (para anexar). */
  docsDoCliente: { id: string; title: string }[];
  responsaveis: Responsavel[];
  pode: { excluir: boolean; verCliente: boolean; documentos: boolean; salvarModeloAviso: boolean };
};

export async function getActivityDetailAction(id: string): Promise<{ ok: true; data: AtividadeDetalhe } | { ok: false; error: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const a = await getActivity(id);
  if (!a) return { ok: false, error: "Atividade não encontrada (pode ter sido excluída)." };

  const supabase = await createClient();
  const perms = await getPermissoes();
  const [etiquetasTodas, documentos, responsaveis, { data: docsCliente }] = await Promise.all([
    listEtiquetas(),
    listDocuments({ activityId: id }),
    listResponsaveis(),
    supabase
      .from("documents")
      .select("id, title")
      .eq("client_id", a.client_id)
      .or(`activity_id.is.null,activity_id.neq.${id}`)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  return {
    ok: true,
    data: {
      id: a.id,
      title: a.title,
      description: a.description,
      type: a.type,
      status: a.status,
      deadline: a.deadline,
      hora: a.hora,
      created_at: a.created_at,
      archived_at: a.archived_at,
      cliente_avisado_em: a.cliente_avisado_em,
      client_id: a.client_id,
      cliente: a.clients?.name ?? null,
      responsavel_id: a.responsavel_id,
      responsavel: nomeResponsavel(a),
      envolvidos: a.envolvidos ?? [],
      etiquetas: a.etiquetas ?? [],
      etiquetasTodas,
      documentos: documentos.map((d) => ({
        id: d.id,
        title: d.title,
        created_at: d.created_at,
        downloadUrl: d.downloadUrl,
        drive_file_id: d.drive_file_id,
      })),
      docsDoCliente: docsCliente ?? [],
      responsaveis,
      pode: { excluir: !!perms?.excluir, verCliente: !!perms?.clientes, documentos: !!perms?.documentos, salvarModeloAviso: profile.role === "admin" },
    },
  };
}

export async function deleteActivityInlineAction(id: string): Promise<{ error: string | null }> {
  await exigirPermissao("excluir");
  const supabase = await createClient();
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) return { error: "Não foi possível excluir. Tente novamente." };
  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { error: null };
}

export async function attachDocumentInlineAction(activityId: string, documentId: string): Promise<{ error: string | null }> {
  await requireRole(["admin", "advogado"]);
  const supabase = await createClient();
  const [{ data: doc }, { data: a }] = await Promise.all([
    supabase.from("documents").select("client_id").eq("id", documentId).maybeSingle(),
    supabase.from("activities").select("client_id").eq("id", activityId).maybeSingle(),
  ]);
  if (!doc || !a || doc.client_id !== a.client_id) return { error: "Documento inválido para esta atividade." };
  const { error } = await supabase.from("documents").update({ activity_id: activityId }).eq("id", documentId);
  if (error) return { error: "Não foi possível anexar. Tente novamente." };
  revalidatePath("/admin/documents");
  return { error: null };
}

/** Cadastra responsável só com nome + Gmail (sem login). E-mail já cadastrado devolve o existente. */
export async function createResponsavelAction(
  nome: string,
  email: string
): Promise<{ ok: true; responsavel: Responsavel } | { ok: false; error: string }> {
  await requireRole(["admin", "advogado"]);
  const n = nome.trim();
  const e = email.trim().toLowerCase();
  if (n.length < 2) return { ok: false, error: "Informe o nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "E-mail inválido." };

  const supabase = await createClient();
  const { data: existente } = await supabase.from("responsaveis").select("id, nome, email, profile_id").ilike("email", e).maybeSingle();
  if (existente) {
    return { ok: true, responsavel: { id: existente.id, nome: existente.nome, email: existente.email, temLogin: !!existente.profile_id, clientes: null } };
  }
  // alguém da equipe com esse e-mail: já nasce ligado ao login
  const { data: perfil } = await supabase.from("profiles").select("id").ilike("email", e).in("role", ["admin", "advogado"]).maybeSingle();
  const { data, error } = await supabase
    .from("responsaveis")
    .insert({ nome: n, email: e, profile_id: perfil?.id ?? null })
    .select("id, nome, email, profile_id")
    .single();
  if (error || !data) return { ok: false, error: "Não foi possível cadastrar. Tente novamente." };
  return { ok: true, responsavel: { id: data.id, nome: data.nome, email: data.email, temLogin: !!data.profile_id, clientes: null } };
}
