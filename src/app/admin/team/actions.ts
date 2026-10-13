"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirPermissao, requireRole } from "@/lib/dal";
import { PERMISSOES } from "@/lib/permissoes";
import { destinoDeVolta } from "@/lib/voltar";

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
  redirect(destinoDeVolta(formData, "/admin/team"));
}

export async function inviteClientPortalUserAction(
  _prevState: InviteUserState,
  formData: FormData
): Promise<InviteUserState> {
  await exigirPermissao("acesso_portal");

  const clientId = formData.get("client_id");
  const fullName = formData.get("full_name");
  const email = formData.get("email");

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Cliente inválido." };
  }
  // só clientes que a pessoa pode ver (regras do banco)
  const { data: visivel } = await (await createClient()).from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!visivel) return { error: "Cliente inválido." };
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

export async function removeStaffAction(formData: FormData): Promise<void> {
  const profile = await requireRole(["admin"]);

  const profileId = formData.get("profile_id");
  if (typeof profileId !== "string" || !profileId) return;
  if (profileId === profile.id) return; // não deixa remover o próprio acesso

  // o user_id vem do banco (nunca do formulário) e só de perfil visível da equipe
  const { data: alvo } = await (await createClient())
    .from("profiles")
    .select("user_id, oculto")
    .eq("id", profileId)
    .in("role", ["admin", "advogado"])
    .maybeSingle();
  if (!alvo || alvo.oculto) return;

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(alvo.user_id); // cascade apaga o profile também

  revalidatePath("/admin/team");
}

export async function removeClientPortalUserAction(formData: FormData): Promise<void> {
  await exigirPermissao("acesso_portal");

  const userId = formData.get("user_id");
  const clientId = formData.get("client_id");
  if (typeof userId !== "string" || !userId) return;

  // só apaga login de CLIENTE que a pessoa pode ver (nunca de equipe)
  const { data: alvo } = await (await createClient())
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "client")
    .maybeSingle();
  if (!alvo) return;

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);

  if (typeof clientId === "string" && clientId) {
    revalidatePath(`/admin/clients/${clientId}`);
  }
}

async function inviteAndCreateProfile(params: {
  email: string;
  fullName: string;
  role: "admin" | "advogado" | "client";
  clientId: string | null;
}): Promise<{ error: string | null }> {
  const admin = createAdminClient();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(params.email, {
    redirectTo: `${siteUrl}/reset-password`,
  });
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

// ---------- gerenciamento da equipe (só admin) ----------

const UUID = /^[0-9a-f-]{36}$/i;

/** Perfil de advogado visível (nunca admin nem conta oculta). */
async function advogadoValido(profileId: string) {
  if (!UUID.test(profileId)) return null;
  const { data } = await (await createClient())
    .from("profiles")
    .select("id, oculto")
    .eq("id", profileId)
    .eq("role", "advogado")
    .maybeSingle();
  return data && !data.oculto ? data : null;
}

export type TeamResult = { ok: true } | { ok: false; error: string };

/** Define todos os clientes de um advogado de uma vez. */
export async function setClientesDoAdvogadoAction(profileId: string, clientIds: string[]): Promise<TeamResult> {
  await requireRole(["admin"]);
  if (!(await advogadoValido(profileId))) return { ok: false, error: "Advogado inválido." };
  const ids = [...new Set(clientIds.filter((i) => UUID.test(i)))];
  const supabase = await createClient();
  const { error: e1 } = await supabase.from("equipe_clientes").delete().eq("profile_id", profileId);
  if (e1) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  if (ids.length) {
    const { error: e2 } = await supabase.from("equipe_clientes").insert(ids.map((client_id) => ({ profile_id: profileId, client_id })));
    if (e2) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }
  revalidatePath("/admin/team");
  return { ok: true };
}

/** Define os advogados de um cliente (a partir da ficha do cliente). */
export async function setAdvogadosDoClienteAction(clientId: string, profileIds: string[]): Promise<TeamResult> {
  await requireRole(["admin"]);
  if (!UUID.test(clientId)) return { ok: false, error: "Cliente inválido." };
  const validos: string[] = [];
  for (const id of new Set(profileIds)) if (await advogadoValido(id)) validos.push(id);
  const supabase = await createClient();
  const { error: e1 } = await supabase.from("equipe_clientes").delete().eq("client_id", clientId);
  if (e1) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  if (validos.length) {
    const { error: e2 } = await supabase.from("equipe_clientes").insert(validos.map((profile_id) => ({ profile_id, client_id: clientId })));
    if (e2) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/team");
  return { ok: true };
}

/** Salva as permissões (liga/desliga) de um advogado. */
export async function savePermissoesAction(profileId: string, valores: Record<string, boolean>): Promise<TeamResult> {
  await requireRole(["admin"]);
  if (!(await advogadoValido(profileId))) return { ok: false, error: "Advogado inválido." };
  const limpas = Object.fromEntries(PERMISSOES.map((p) => [p.chave, typeof valores[p.chave] === "boolean" ? valores[p.chave] : p.padrao]));
  const { error } = await (await createClient())
    .from("equipe_permissoes")
    .upsert({ profile_id: profileId, permissoes: limpas, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  revalidatePath("/admin/team");
  return { ok: true };
}

/** Desativa/reativa o acesso de um advogado (sem apagar nada). */
export async function setAtivoAction(profileId: string, ativo: boolean): Promise<TeamResult> {
  await requireRole(["admin"]);
  if (!(await advogadoValido(profileId))) return { ok: false, error: "Advogado inválido." };
  const { error } = await (await createClient()).from("profiles").update({ ativo }).eq("id", profileId);
  if (error) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  revalidatePath("/admin/team");
  return { ok: true };
}
