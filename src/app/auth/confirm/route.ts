import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Endpoint pro qual o template de e-mail do Supabase (recovery, invite,
// etc) deve redirecionar — troca o token_hash por uma sessão de verdade
// (cookies) no servidor, antes de mandar pro destino final. Necessário
// porque createBrowserClient do @supabase/ssr usa flowType "pkce" e não
// processa o link padrão do Supabase (#access_token no hash da URL).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
