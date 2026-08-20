"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/dal";

export type InviteUserState = { error: string | null };

const STAFF_ROLES = ["admin", "advogado"] as const;

export async function inviteStaffAction(
  _prevState: InviteUserState,
  formData: FormData
): Promise<InviteUserState> {
  await requireRole(["admin"]);

  const fullName = formData.get("full_name");
  const email = formData.get("email");
  const role = formData.get("role");

  if (typeof fullName !== "string" || !fullName.trim()) {
    return { error: "Informe o nome completo." };
  }
  if (typeof email !== "string" || !email.trim()) {
    return { error: "Informe o e-mail." };
  }
  if (typeof role !== "string" || !STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
    return { error: "Selecione o papel." };
  }

  const result = await inviteAndCreateProfile({
    email: email.trim(),
    fullName: fullName.trim(),
    role: role as "admin" | "advogado",
    clientId: null,
  });
  if (result.error) return { error: result.error };

  revalidatePath("/admin/team");
  redirect("/admin/team");
}

export async function inviteClientPortalUserAction(
  _prevState: InviteUserState,
  formData: FormData
): Promise<InviteUserState> {
  await requireRole(["admin"]);

  const clientId = formData.get("client_id");
  const fullName = formData.get("full_name");
  const email = formData.get("email");

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Cliente inválido." };
  }
  if (typeof fullName !== "string" || !fullName.trim()) {
    return { error: "Informe o nome do contato." };
  }
  if (typeof email !== "string" || !email.trim()) {
    return { error: "Informe o e-mail." };
  }

  const result = await inviteAndCreateProfile({
    email: email.trim(),
    fullName: fullName.trim(),
    role: "client",
    clientId,
  });
  if (result.error) return { error: result.error };

  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null };
}

async function inviteAndCreateProfile(params: {
  email: string;
  fullName: string;
  role: "admin" | "advogado" | "client";
  clientId: string | null;
}): Promise<{ error: string | null }> {
  const admin = createAdminClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(params.email);
  if (inviteError || !invited.user) {
    const message = inviteError?.message?.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return { error: "Já existe um usuário cadastrado com esse e-mail." };
    }
    if (message.includes("rate limit")) {
      return {
        error:
          "Limite de e-mails do Supabase atingido (o projeto usa o serviço de e-mail padrão, que é bem restrito). Configure um SMTP próprio em Authentication > Emails no painel do Supabase, ou tente de novo em alguns minutos.",
      };
    }
    return { error: "Não foi possível enviar o convite. Tente novamente." };
  }

  const supabase = await createClient();
  const { error: profileError } = await supabase.from("profiles").insert({
    user_id: invited.user.id,
    client_id: params.clientId,
    role: params.role,
    full_name: params.fullName,
    email: params.email,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(invited.user.id);
    return { error: "Convite enviado, mas não foi possível vincular o perfil. Tente novamente." };
  }

  return { error: null };
}
