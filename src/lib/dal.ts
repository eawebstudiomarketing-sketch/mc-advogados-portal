import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

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
  return profile;
}

export async function requireRole(allowedRoles: Profile["role"][]): Promise<Profile> {
  const profile = await requireProfile();
  if (!allowedRoles.includes(profile.role)) {
    redirect(profile.role === "client" ? "/dashboard" : "/admin");
  }
  return profile;
}
