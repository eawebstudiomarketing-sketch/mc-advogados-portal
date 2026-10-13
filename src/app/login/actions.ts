"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

function safeNextPath(next: FormDataEntryValue | null): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Preencha e-mail e senha." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "E-mail ou senha inválidos." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, ativo")
    .eq("user_id", data.user.id)
    .single();

  if (profile && !profile.ativo) {
    await supabase.auth.signOut();
    return { error: "Seu acesso ao portal foi desativado. Fale com o administrador." };
  }

  const next = safeNextPath(formData.get("next"));
  redirect(next ?? (profile?.role === "client" ? "/dashboard" : "/admin"));
}
