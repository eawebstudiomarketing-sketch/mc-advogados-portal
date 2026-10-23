"use server";

import { headers } from "next/headers";
import { assinarComCodigo, pedirCodigo, pedirCorrecao } from "@/lib/atas/assinatura";

// Ações da página pública de assinatura. Sem login: quem tem o link (token)
// pede o código, assina ou pede correção. Tudo é conferido no servidor.

type R<T = object> = ({ ok: true } & T) | { ok: false; erro: string };
const falha = (e: unknown) => ({ ok: false as const, erro: e instanceof Error ? e.message : "Não deu certo. Tente de novo." });

export async function pedirCodigoAction(token: string, canal: "zap" | "email"): Promise<R<{ destino: string }>> {
  try {
    return { ok: true, ...(await pedirCodigo(token, canal === "email" ? "email" : "zap")) };
  } catch (e) {
    return falha(e);
  }
}

export async function assinarAction(token: string, codigo: string): Promise<R<{ completa: boolean }>> {
  const h = await headers();
  try {
    const r = await assinarComCodigo(token, String(codigo ?? ""), { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip"), ua: h.get("user-agent") });
    return { ok: true, ...r };
  } catch (e) {
    return falha(e);
  }
}

export async function pedirCorrecaoAction(token: string, texto: string): Promise<R> {
  try {
    await pedirCorrecao(token, String(texto ?? ""));
    return { ok: true };
  } catch (e) {
    return falha(e);
  }
}
