"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, exigirPermissao } from "@/lib/dal";
import { PROCESS_AREAS } from "@/lib/process-area";
import type { Database } from "@/lib/supabase/types";
import { ligarPublicacoesAosProcessos } from "@/lib/publicacoes/monitor";
import { destinoDeVolta } from "@/lib/voltar";

export type CreateProcessState = { error: string | null };

export async function createProcessAction(
  _prevState: CreateProcessState,
  formData: FormData
): Promise<CreateProcessState> {
  const profile = await requireRole(["admin", "advogado"]);

  const clientId = formData.get("client_id");
  const numeroProcesso = formData.get("numero_processo");
  const varaTribunal = formData.get("vara_tribunal");
  const area = formData.get("area");
  const fase = formData.get("fase");

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }
  if (typeof numeroProcesso !== "string" || !numeroProcesso.trim()) {
    return { error: "Informe o número do processo." };
  }
  if (typeof area !== "string" || !PROCESS_AREAS.includes(area as never)) {
    return { error: "Selecione a área do processo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("processes").insert({
    client_id: clientId,
    numero_processo: numeroProcesso.trim(),
    vara_tribunal: typeof varaTribunal === "string" && varaTribunal.trim() ? varaTribunal.trim() : null,
    area: area as Database["public"]["Enums"]["process_area"],
    fase: typeof fase === "string" && fase.trim() ? fase.trim() : null,
    responsible_id: profile.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um processo cadastrado com esse número." };
    }
    return { error: "Não foi possível salvar o processo. Tente novamente." };
  }

  // Publicações do DJEN que chegaram antes do cadastro passam a apontar para ele.
  await ligarPublicacoesAosProcessos();
  revalidatePath("/admin/processes");
  revalidatePath("/admin/publicacoes");
  redirect(destinoDeVolta(formData, "/admin/processes"));
}

export type UpdateProcessState = { error: string | null };

export async function updateProcessAction(
  _prevState: UpdateProcessState,
  formData: FormData
): Promise<UpdateProcessState> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const numeroProcesso = formData.get("numero_processo");
  const varaTribunal = formData.get("vara_tribunal");
  const area = formData.get("area");
  const fase = formData.get("fase");
  const status = formData.get("status");

  if (typeof id !== "string" || !id) {
    return { error: "Processo inválido." };
  }
  if (typeof numeroProcesso !== "string" || !numeroProcesso.trim()) {
    return { error: "Informe o número do processo." };
  }
  if (typeof area !== "string" || !PROCESS_AREAS.includes(area as never)) {
    return { error: "Selecione a área do processo." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("processes")
    .update({
      numero_processo: numeroProcesso.trim(),
      vara_tribunal: typeof varaTribunal === "string" && varaTribunal.trim() ? varaTribunal.trim() : null,
      area: area as Database["public"]["Enums"]["process_area"],
      fase: typeof fase === "string" && fase.trim() ? fase.trim() : null,
      status: typeof status === "string" && status.trim() ? status.trim() : "ativo",
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um processo cadastrado com esse número." };
    }
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  revalidatePath("/admin/processes");
  redirect(destinoDeVolta(formData, "/admin/processes"));
}

export async function deleteProcessAction(formData: FormData): Promise<void> {
  await exigirPermissao("excluir");

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await supabase.from("processes").delete().eq("id", id);

  revalidatePath("/admin/processes");
  redirect("/admin/processes");
}

/** Liga um processo (vindo do Astrea sem ficha) a um cliente do portal. */
export async function vincularClienteProcessoAction(formData: FormData): Promise<void> {
  await exigirPermissao("processos");
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("processes").update({ client_id: clientId || null }).eq("id", id);
  await supabase.from("publicacoes").update({ client_id: clientId || null }).eq("process_id", id);
  revalidatePath(`/admin/processes/${id}`);
  revalidatePath("/admin/processes");
  revalidatePath("/admin/alertas", "layout");
}
