import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Encerra a sessão e volta ao login (usado quando o acesso foi desativado).
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const motivo = new URL(request.url).searchParams.get("motivo");
  return NextResponse.redirect(new URL(motivo ? `/login?erro=${encodeURIComponent(motivo)}` : "/login", request.url));
}
