"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";

export type CreateClientState = { error: string | null };

export async function createClientAction(
  _prevState: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  // RLS já bloqueia advogado de escrever em `clients`, mas confirmar aqui
  // evita a viagem ao banco só pra receber o erro de permissão.
  await requireRole(["admin"]);

  const name = formData.get("name");
  const tipoPessoa = formData.get("tipo_pessoa");
  const documento = formData.get("documento");
  const emailContact = formData.get("email_contact");

  if (typeof name !== "string" || !name.trim()) {
    return { error: "Informe o nome do cliente." };
  }
  if (tipoPessoa !== "PF" && tipoPessoa !== "PJ") {
    return { error: "Selecione o tipo de pessoa." };
  }
  if (typeof documento !== "string" || !documento.trim()) {
    return { error: "Informe o CPF/CNPJ." };
  }
  if (typeof emailContact !== "string" || !emailContact.trim()) {
    return { error: "Informe o e-mail de contato." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: name.trim(),
      tipo_pessoa: tipoPessoa,
      documento: documento.trim(),
      email_contact: emailContact.trim(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um cliente cadastrado com esse CPF/CNPJ." };
    }
    return { error: "Não foi possível salvar o cliente. Tente novamente." };
  }

  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${data.id}`);
}

export type UpdateClientState = { error: string | null };

export async function updateClientAction(
  _prevState: UpdateClientState,
  formData: FormData
): Promise<UpdateClientState> {
  await requireRole(["admin"]);

  const id = formData.get("id");
  const name = formData.get("name");
  const tipoPessoa = formData.get("tipo_pessoa");
  const documento = formData.get("documento");
  const emailContact = formData.get("email_contact");
  const active = formData.get("active") === "on";

  if (typeof id !== "string" || !id) {
    return { error: "Cliente inválido." };
  }
  if (typeof name !== "string" || !name.trim()) {
    return { error: "Informe o nome do cliente." };
  }
  if (tipoPessoa !== "PF" && tipoPessoa !== "PJ") {
    return { error: "Selecione o tipo de pessoa." };
  }
  if (typeof documento !== "string" || !documento.trim()) {
    return { error: "Informe o CPF/CNPJ." };
  }
  if (typeof emailContact !== "string" || !emailContact.trim()) {
    return { error: "Informe o e-mail de contato." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name: name.trim(),
      tipo_pessoa: tipoPessoa,
      documento: documento.trim(),
      email_contact: emailContact.trim(),
      active,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um cliente cadastrado com esse CPF/CNPJ." };
    }
    return { error: "Não foi possível salvar as alterações. Tente novamente." };
  }

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  redirect(`/admin/clients/${id}`);
}
