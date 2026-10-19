"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehSuperAdmin, exigirPermissao, exigirSuperAdmin } from "@/lib/dal";
import { PERMISSOES } from "@/lib/permissoes";
import { destinoDeVolta } from "@/lib/voltar";

export type InviteUserState = { error: string | null };

const STAFF_ROLES = ["admin", "advogado"] as const;

export async function inviteStaffAction(
  _prevState: InviteUserState,
  formData: FormData
): Promise<InviteUserState> {
  const { profile } = await exigirPermissao("equipe");

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
  // admin novo começa vendo tudo: só o admin máximo cria
  if (role === "admin" && !ehSuperAdmin(profile)) {
    return { error: "Só o admin máximo pode convidar outro administrador." };
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
  const { profile } = await exigirPermissao("equipe");

  const profileId = formData.get("profile_id");
  if (typeof profileId !== "string" || !profileId) return;
  if (profileId === profile.id) return; // não deixa remover o próprio acesso

  // o user_id vem do banco (nunca do formulário) e só de perfil visível da equipe
  const { data: alvo } = await (await createClient())
    .from("profiles")
    .select("user_id, oculto, role, super_admin")
    .eq("id", profileId)
    .in("role", ["admin", "advogado"])
    .maybeSingle();
  if (!alvo || alvo.oculto || alvo.super_admin) return;
  if (alvo.role === "admin" && !ehSuperAdmin(profile)) return; // admin só sai pelo admin máximo

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
      return reaproveitarLoginSemPerfil(params);
    }
    if (message.includes("rate limit")) {
      return {
        error:
          "Limite de e-mails do Supabase atingido (o projeto usa o serviço de e-mail padrão, que é bem restrito). Configure um SMTP próprio em Authentication > Emails no painel do Supabase, ou tente de novo em alguns minutos.",
      };
    }
    return { error: "Não foi possível enviar o convite. Tente novamente." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
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

// Login que ficou sem perfil (ex.: cliente excluído antes de o login ser
// apagado junto): vincula o perfil novo e manda o link pra criar a senha.
async function reaproveitarLoginSemPerfil(params: {
  email: string;
  fullName: string;
  role: "admin" | "advogado" | "client";
  clientId: string | null;
}): Promise<{ error: string | null }> {
  const jaExiste = { error: "Já existe um usuário cadastrado com esse e-mail." };
  const admin = createAdminClient();
  const alvo = params.email.toLowerCase();
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return jaExiste;
    userId = data.users.find((u) => u.email?.toLowerCase() === alvo)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) return jaExiste;

  const { data: perfil } = await admin.from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (perfil) return jaExiste;

  const { error: profileError } = await admin.from("profiles").insert({
    user_id: userId,
    client_id: params.clientId,
    role: params.role,
    full_name: params.fullName,
    email: params.email,
  });
  if (profileError) return { error: "Não foi possível vincular o perfil. Tente novamente." };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error: linkError } = await admin.auth.resetPasswordForEmail(params.email, {
    redirectTo: `${siteUrl}/reset-password`,
  });
  if (linkError) {
    return { error: "Acesso liberado, mas o e-mail não saiu. Peça para a pessoa usar \"Esqueci minha senha\" no login." };
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

/** Advogado ou admin comum visível (o admin máximo não tem o que limitar). */
async function membroValido(profileId: string) {
  if (!UUID.test(profileId)) return null;
  const { data } = await (await createClient())
    .from("profiles")
    .select("id, role, oculto, super_admin")
    .eq("id", profileId)
    .in("role", ["admin", "advogado"])
    .maybeSingle();
  return data && !data.oculto && !data.super_admin ? data : null;
}

export type TeamResult = { ok: true } | { ok: false; error: string };

/** Define todos os clientes de uma pessoa da equipe de uma vez (só o admin máximo). */
export async function setClientesDoAdvogadoAction(profileId: string, clientIds: string[]): Promise<TeamResult> {
  await exigirSuperAdmin();
  if (!(await membroValido(profileId))) return { ok: false, error: "Pessoa inválida." };
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
  await exigirSuperAdmin();
  if (!UUID.test(clientId)) return { ok: false, error: "Cliente inválido." };
  const validos: string[] = [];
  for (const id of new Set(profileIds)) if (await advogadoValido(id)) validos.push(id);
  const supabase = await createClient();
  // a ficha só mexe nos advogados; designações de admins comuns ficam como estão
  const { data: advs } = await supabase.from("profiles").select("id").eq("role", "advogado");
  const { error: e1 } = await supabase
    .from("equipe_clientes")
    .delete()
    .eq("client_id", clientId)
    .in("profile_id", (advs ?? []).map((a) => a.id));
  if (e1) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  if (validos.length) {
    const { error: e2 } = await supabase.from("equipe_clientes").insert(validos.map((profile_id) => ({ profile_id, client_id: clientId })));
    if (e2) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  }
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/team");
  return { ok: true };
}

/** Salva as permissões (liga/desliga) de um advogado ou admin comum (só o admin máximo). */
export async function savePermissoesAction(profileId: string, valores: Record<string, boolean>): Promise<TeamResult> {
  await exigirSuperAdmin();
  const membro = await membroValido(profileId);
  if (!membro) return { ok: false, error: "Pessoa inválida." };
  const padrao = (p: (typeof PERMISSOES)[number]) => (membro.role === "admin" ? true : p.padrao);
  const limpas = Object.fromEntries(PERMISSOES.map((p) => [p.chave, typeof valores[p.chave] === "boolean" ? valores[p.chave] : padrao(p)]));
  const { error } = await (await createClient())
    .from("equipe_permissoes")
    .upsert({ profile_id: profileId, permissoes: limpas, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  revalidatePath("/admin/team");
  return { ok: true };
}

/** Desativa/reativa o acesso de um advogado ou admin comum (só o admin máximo). */
export async function setAtivoAction(profileId: string, ativo: boolean): Promise<TeamResult> {
  await exigirSuperAdmin();
  if (!(await membroValido(profileId))) return { ok: false, error: "Pessoa inválida." };
  const { error } = await (await createClient()).from("profiles").update({ ativo }).eq("id", profileId);
  if (error) return { ok: false, error: "Não foi possível salvar. Tente novamente." };
  revalidatePath("/admin/team");
  return { ok: true };
}

// ───────────── pessoas: telefone, áreas e rotina no Zap ─────────────

const soDigitos = (t: string) => t.replace(/\D/g, "");

export async function salvarPessoaAction(
  responsavelId: string,
  dados: { telefone: string; areas: string[]; rotinaZap: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  await exigirPermissao("equipe");
  const tel = soDigitos(dados.telefone);
  if (tel && (tel.length < 10 || tel.length > 13)) return { ok: false, error: "Telefone inválido. Use DDD + número, ex.: 73 99999-9999." };
  const { error } = await createAdminClient()
    .from("responsaveis")
    .update({ telefone: tel || null, areas: dados.areas.map((a) => a.trim()).filter(Boolean), rotina_zap: dados.rotinaZap })
    .eq("id", responsavelId);
  if (error) return { ok: false, error: "Não foi possível salvar." };
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function salvarAreasEscritorioAction(areas: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  await exigirPermissao("equipe");
  const lista = [...new Set(areas.map((a) => a.trim()).filter(Boolean))];
  if (!lista.length) return { ok: false, error: "Deixe pelo menos uma área." };
  const { error } = await createAdminClient().from("escritorio_config").update({ areas: lista, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { ok: false, error: "Não foi possível salvar as áreas." };
  revalidatePath("/admin/team");
  return { ok: true };
}

export async function salvarZapConfigAction(dados: {
  lembrete_24h: string;
  lembrete_1h: string;
  lembretes_ativos: boolean;
  rotina_ativa: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await exigirPermissao("equipe");
  if (!dados.lembrete_24h.trim() || !dados.lembrete_1h.trim()) return { ok: false, error: "Os dois textos de lembrete são obrigatórios." };
  const { error } = await createAdminClient()
    .from("escritorio_config")
    .update({ ...dados, lembrete_24h: dados.lembrete_24h.trim(), lembrete_1h: dados.lembrete_1h.trim(), updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: "Não foi possível salvar." };
  revalidatePath("/admin/team");
  return { ok: true };
}
