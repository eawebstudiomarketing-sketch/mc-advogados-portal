import "server-only";
import { timingSafeEqual } from "node:crypto";

// Pequenas defesas reutilizadas pelas rotas (28/10/2026).

/** Compara dois segredos em tempo constante (sem vazar, pelo tempo de resposta, quantos caracteres acertou). */
export function segredoConfere(recebido: string | null | undefined, certo: string | null | undefined): boolean {
  if (!certo || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(certo);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Cron da Vercel: "Authorization: Bearer $CRON_SECRET". */
export function cronAutorizado(request: Request): boolean {
  return segredoConfere(request.headers.get("authorization"), process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null);
}

/** Só caminho interno ("/admin/x"): barra, nada de "//", "\\" ou esquema/host (evita redirecionar para site de fora). */
export function caminhoInterno(valor: string | null | undefined, padrao = "/"): string {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\") || /[\u0000-\u001f]/.test(valor)) return padrao;
  return valor;
}
