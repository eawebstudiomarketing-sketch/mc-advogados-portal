"use server";

import { createClient } from "@/lib/supabase/server";

export type ForgotPasswordState = { message: string | null; error: string | null };

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    return { message: null, error: "Informe o e-mail." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${siteUrl}/reset-password`,
  });

  // Mesma mensagem sempre, exista ou não o e-mail — evita dar pista de
  // quais e-mails têm conta no sistema.
  return {
    message: "Se esse e-mail estiver cadastrado, você vai receber um link pra redefinir a senha.",
    error: null,
  };
}
