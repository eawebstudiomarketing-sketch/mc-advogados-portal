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

export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
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
  if (!profile) redirect("/login");
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

/** Permissões efetivas de quem está logado (admin: tudo). */
export const getPermissoes = cache(async (): Promise<Permissoes | null> => {
  const profile = await getProfile();
  if (!profile || profile.role === "client") return null;
  if (profile.role === "admin") return resolverPermissoes("admin", null);
  const supabase = await createClient();
  const { data } = await supabase.from("equipe_permissoes").select("permissoes").eq("profile_id", profile.id).maybeSingle();
  return resolverPermissoes(profile.role, data?.permissoes);
});

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
