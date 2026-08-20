import "server-only";
import { Resend } from "resend";

export type EmailConfigError = "not_configured";

// Retorna null se RESEND_API_KEY/RESEND_FROM_EMAIL ainda não foram
// configurados — quem chamar deve tratar isso como "recurso indisponível",
// não como erro inesperado (é esperado até o usuário configurar o Resend).
export function getResendClient(): { client: Resend; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return null;
  return { client: new Resend(apiKey), from };
}
