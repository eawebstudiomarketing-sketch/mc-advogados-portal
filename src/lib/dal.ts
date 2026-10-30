import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { primeiraTela, resolverPermissoes, type PermChave, type Permissoes } from "@/lib/permissoes";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// Optimistic check já feito no proxy (existe sessão?). Aqui é a checagem de
// verdade: busca o usuário direto na Auth API do Supabase (revalida o JWT
// contra o servidor, não confia só no cookie) e o profile/role associados.
// `cache()` garante uma única consulta por request mesmo se chamado em
// vários Server Components da mesma árvore.

export const getUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  const supabase = await createClient();
  // getClaims confere a assinatura do token com a chave pública do projeto (ES256), sem ir ao
  // servidor de autenticação a cada página (desempenho, 30/10/2026). Quem foi desativado cai
  // pelo profile.ativo logo abaixo.
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  return c?.sub ? { id: String(c.sub), email: typeof c.email === "string" ? c.email : null } : null;
});

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return data;
});

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) {
    // sessão válida sem perfil: só ir pro /login fazia o proxy devolver pra "/" em loop
    if (await getUser()) redirect("/api/sair?motivo=sem-perfil");
    redirect("/login");
  }
  // acesso desativado pelo admin: encerra a sessão
  if (!profile.ativo) redirect("/api/sair?motivo=desativado");
  return profile;
}

export async function requireRole(allowedRoles: Profile["role"][]): Promise<Profile> {
  const profile = await requireProfile();
  if (!allowedRoles.includes(profile.role)) {
    redirect(profile.role === "client" ? "/dashboard" : "/admin");
  }
  return profile;
}

/** Admin máximo: vê tudo e é o único que muda o que cada pessoa vê. */
export const ehSuperAdmin = (profile: Pick<Profile, "role" | "super_admin"> | null) => !!profile && profile.role === "admin" && !!profile.super_admin;

/** Permissões efetivas de quem está logado (admin máximo: tudo). */
export const getPermissoes = cache(async (): Promise<Permissoes | null> => {
  const profile = await getProfile();
  if (!profile || profile.role === "client") return null;
  if (ehSuperAdmin(profile)) return resolverPermissoes("admin", null, true);
  const supabase = await createClient();
  const { data } = await supabase.from("equipe_permissoes").select("permissoes").eq("profile_id", profile.id).maybeSingle();
  return resolverPermissoes(profile.role, data?.permissoes);
});

/** Só o admin máximo (permissões e clientes de cada pessoa). */
export async function exigirSuperAdmin(): Promise<Profile> {
  const profile = await requireRole(["admin"]);
  if (!ehSuperAdmin(profile)) redirect("/admin/team");
  return profile;
}

/**
 * Equipe (admin ou advogado) com as permissões pedidas; sem elas, volta para
 * a primeira tela liberada. Use nas páginas e nas server actions.
 */
export async function exigirPermissao(...chaves: PermChave[]): Promise<{ profile: Profile; permissoes: Permissoes }> {
  const profile = await requireRole(["admin", "advogado"]);
  const permissoes = (await getPermissoes())!;
  if (!chaves.every((c) => permissoes[c])) redirect(primeiraTela(permissoes));
  return { profile, permissoes };
}

/** Para server actions que devolvem erro em vez de redirecionar. */
export async function temPermissao(...chaves: PermChave[]): Promise<boolean> {
  const permissoes = await getPermissoes();
  return !!permissoes && chaves.every((c) => permissoes[c]);
}
