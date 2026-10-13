"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, exigirPermissao } from "@/lib/dal";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import { ACTIVITY_STATUSES } from "@/lib/activity-status";
import type { Database } from "@/lib/supabase/types";
import { destinoDeVolta } from "@/lib/voltar";

type Db = Awaited<ReturnType<typeof createClient>>;

// Responsável escolhido (tabela responsaveis: equipe com login ou só nome+Gmail).
// Quando a pessoa tem login, o responsible_id (dono/autor no banco) acompanha.
async function lerResponsavel(
  supabase: Db,
  escolhido: FormDataEntryValue | null
): Promise<{ responsavel_id: string; responsible_id?: string } | null | undefined> {
  if (typeof escolhido !== "string" || !escolhido) return undefined; // não veio no formulário
  const { data } = await supabase.from("responsaveis").select("id, profile_id").eq("id", escolhido).maybeSingle();
  if (!data) return null; // inválido
  return data.profile_id ? { responsavel_id: data.id, responsible_id: data.profile_id } : { responsavel_id: data.id };
}

export type CreateActivityState = { error: string | null };

export async function createActivityAction(
  _prevState: CreateActivityState,
  formData: FormData
): Promise<CreateActivityState> {
  const profile = await requireRole(["admin", "advogado"]);

  const clientId = formData.get("client_id");
  const title = formData.get("title");
  const description = formData.get("description");
  const type = formData.get("type");
  const deadline = formData.get("deadline");

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Informe o título da atividade." };
  }
  if (typeof type !== "string" || !ACTIVITY_TYPES.includes(type as never)) {
    return { error: "Selecione o tipo de atividade." };
  }

  const supabase = await createClient();
  const responsavel = await lerResponsavel(supabase, formData.get("responsavel_id"));
  if (responsavel === null) return { error: "Responsável inválido." };
  const { data: criada, error } = await supabase.from("activities").insert({
    client_id: clientId,
    responsible_id: responsavel?.responsible_id ?? profile.id,
    ...(responsavel ? { responsavel_id: responsavel.responsavel_id } : {}),
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    type: type as Database["public"]["Enums"]["activity_type"],
    deadline: typeof deadline === "string" && deadline ? deadline : null,
  }).select("id").single();

  if (error) {
    return { error: "Não foi possível salvar a atividade. Tente novamente." };
  }

  // Veio de uma publicação do DJEN: ela passa a "tratada" e aponta para a atividade.
  const publicacaoId = formData.get("publicacao_id");
  if (typeof publicacaoId === "string" && publicacaoId && criada) {
    await supabase
      .from("publicacoes")
      .update({ status: "tratada", activity_id: criada.id, tratada_por: profile.id, tratada_em: new Date().toISOString() })
      .eq("id", publicacaoId);
    revalidatePath("/admin/publicacoes");
  }

  revalidatePath("/admin/activities");
  redirect(destinoDeVolta(formData, "/admin/activities"));
}

export async function updateActivityStatusAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const status = formData.get("status");

  if (typeof id !== "string" || !id) return;
  if (typeof status !== "string" || !ACTIVITY_STATUSES.includes(status as never)) return;

  const supabase = await createClient();
  await supabase
    .from("activities")
    .update({ status: status as Database["public"]["Enums"]["activity_status"] })
    .eq("id", id);

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
}

export type UpdateActivityState = { error: string | null };

// Núcleo da edição: usado pela página de edição e pela mini tela da atividade.
async function salvarAtividade(formData: FormData): Promise<string | null> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const title = formData.get("title");
  const description = formData.get("description");
  const type = formData.get("type");
  const deadline = formData.get("deadline");

  if (typeof id !== "string" || !id) return "Atividade inválida.";
  if (typeof title !== "string" || !title.trim()) return "Informe o título da atividade.";
  if (typeof type !== "string" || !ACTIVITY_TYPES.includes(type as never)) return "Selecione o tipo de atividade.";

  const supabase = await createClient();
  const responsavel = await lerResponsavel(supabase, formData.get("responsavel_id"));
  if (responsavel === null) return "Responsável inválido.";
  const status = formData.get("status");
  const { error } = await supabase
    .from("activities")
    .update({
      ...(responsavel ?? {}),
      ...(typeof status === "string" && ACTIVITY_STATUSES.includes(status as never)
        ? { status: status as Database["public"]["Enums"]["activity_status"] }
        : {}),
      title: title.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      type: type as Database["public"]["Enums"]["activity_type"],
      deadline: typeof deadline === "string" && deadline ? deadline : null,
    })
    .eq("id", id);

  if (error) return "Não foi possível salvar as alterações. Tente novamente.";
  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return null;
}

export async function updateActivityAction(
  _prevState: UpdateActivityState,
  formData: FormData
): Promise<UpdateActivityState> {
  const erro = await salvarAtividade(formData);
  if (erro) return { error: erro };
  redirect(destinoDeVolta(formData, "/admin/activities"));
}

/** Mini tela: salva sem sair da tela. */
export async function saveActivityInlineAction(formData: FormData): Promise<{ error: string | null }> {
  return { error: await salvarAtividade(formData) };
}

export async function deleteActivityAction(formData: FormData): Promise<void> {
  await exigirPermissao("excluir");

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await supabase.from("activities").delete().eq("id", id);

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  redirect(destinoDeVolta(formData, "/admin/activities", id));
}

// ---------- ações em massa (lista com caixas de seleção) ----------

export type BulkResult = { ok: true; count: number } | { ok: false; error: string };

const MAX_LOTE = 500;

function idsValidos(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const limpos = [...new Set(ids.filter((i): i is string => typeof i === "string" && /^[0-9a-f-]{36}$/i.test(i)))];
  return limpos.length && limpos.length <= MAX_LOTE ? limpos : null;
}

export async function bulkUpdateStatusAction(ids: string[], status: string): Promise<BulkResult> {
  await requireRole(["admin", "advogado"]);
  const lista = idsValidos(ids);
  if (!lista) return { ok: false, error: "Nenhuma atividade selecionada." };
  if (!ACTIVITY_STATUSES.includes(status as never)) return { ok: false, error: "Status inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({ status: status as Database["public"]["Enums"]["activity_status"] })
    .in("id", lista)
    .select("id");
  if (error) return { ok: false, error: "Não foi possível mudar o status. Tente novamente." };

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { ok: true, count: data?.length ?? 0 };
}

export async function bulkUpdateDeadlineAction(ids: string[], deadline: string | null): Promise<BulkResult> {
  await requireRole(["admin", "advogado"]);
  const lista = idsValidos(ids);
  if (!lista) return { ok: false, error: "Nenhuma atividade selecionada." };
  if (deadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { ok: false, error: "Data inválida." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").update({ deadline }).in("id", lista).select("id");
  if (error) return { ok: false, error: "Não foi possível mudar o prazo. Tente novamente." };

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { ok: true, count: data?.length ?? 0 };
}

// Documentos anexados às atividades saem junto (cascata) e vão para a Lixeira.
export async function bulkDeleteActivitiesAction(ids: string[]): Promise<BulkResult> {
  await exigirPermissao("excluir");
  const lista = idsValidos(ids);
  if (!lista) return { ok: false, error: "Nenhuma atividade selecionada." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").delete().in("id", lista).select("id");
  if (error) return { ok: false, error: "Não foi possível excluir. Tente novamente." };

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { ok: true, count: data?.length ?? 0 };
}

export async function bulkArchiveActivitiesAction(ids: string[], arquivar: boolean): Promise<BulkResult> {
  await requireRole(["admin", "advogado"]);
  const lista = idsValidos(ids);
  if (!lista) return { ok: false, error: "Nenhuma atividade selecionada." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({ archived_at: arquivar ? new Date().toISOString() : null })
    .in("id", lista)
    .select("id");
  if (error) return { ok: false, error: "Não foi possível arquivar. Tente novamente." };

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { ok: true, count: data?.length ?? 0 };
}
