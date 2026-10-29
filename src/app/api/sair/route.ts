import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Encerra a sessão quando o acesso foi desativado (ou a conta ficou sem perfil) e
// volta ao login. Só age nesses casos: um site de fora não consegue deslogar
// ninguém mandando esta URL (para sair por vontade própria existe o botão Sair).
const MOTIVOS = new Set(["desativado", "sem-perfil"]);

export async function GET(request: Request) {
  const motivo = new URL(request.url).searchParams.get("motivo");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: perfil } = await supabase.from("profiles").select("ativo").eq("user_id", user.id).maybeSingle();
    if (perfil && perfil.ativo) return NextResponse.redirect(new URL("/", request.url)); // acesso normal: não desloga
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL(motivo && MOTIVOS.has(motivo) ? `/login?erro=${encodeURIComponent(motivo)}` : "/login", request.url));
}
