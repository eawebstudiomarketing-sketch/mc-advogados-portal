"use server";

import { headers } from "next/headers";
import {
  assinarComCodigo,
  pedirCodigo,
  pedirCorrecao,
  recusar,
  salvarAssinaturaDesenho,
  salvarCertificado,
  salvarDocumento,
  salvarGps,
  salvarSelfie,
} from "@/lib/atas/assinatura";
import { ipDe, localPeloIp } from "@/lib/atas/identidade";
import type { Certificado } from "@/lib/atas/identidade";

// Ações da página pública de assinatura. Sem login: quem tem o link (token)
// faz cada etapa (assinatura, selfie, documento, certificado, local, código)
// ou pede correção/recusa. Tudo é conferido no servidor a cada passo.

type R<T = object> = ({ ok: true } & T) | { ok: false; erro: string };
const falha = (e: unknown) => ({ ok: false as const, erro: e instanceof Error ? e.message : "Não deu certo. Tente de novo." });
async function tentar<T extends object>(f: () => Promise<T>): Promise<R<T>> {
  try {
    return { ok: true, ...(await f()) };
  } catch (e) {
    return falha(e);
  }
}

export const salvarAssinaturaAction = async (token: string, png: string, tipo: "desenho" | "digitada"): Promise<R> => tentar(async () => (await salvarAssinaturaDesenho(token, png, tipo), {}));
export const salvarSelfieAction = async (token: string, jpeg: string): Promise<R> => tentar(async () => (await salvarSelfie(token, jpeg), {}));
export const salvarDocumentoAction = async (token: string, frente: string, verso: string | null, cpf: string | null): Promise<R> =>
  tentar(async () => (await salvarDocumento(token, frente, verso, cpf), {}));
export const salvarGpsAction = async (token: string, gps: { lat: number; lng: number; precisao: number | null }): Promise<R> => tentar(async () => (await salvarGps(token, gps), {}));
export const salvarCertificadoAction = async (token: string, p7s: string): Promise<R<{ certificado: Certificado }>> => tentar(async () => ({ certificado: await salvarCertificado(token, p7s) }));
export const pedirCodigoAction = async (token: string, canal: "zap" | "email"): Promise<R<{ destino: string }>> => tentar(() => pedirCodigo(token, canal === "email" ? "email" : "zap"));

export async function assinarAction(token: string, codigo: string): Promise<R<{ completa: boolean }>> {
  const h = await headers();
  return tentar(() => assinarComCodigo(token, String(codigo ?? ""), { ip: ipDe(h), ua: h.get("user-agent"), local: localPeloIp(h) }));
}

export const pedirCorrecaoAction = async (token: string, texto: string): Promise<R> => tentar(async () => (await pedirCorrecao(token, String(texto ?? "")), {}));
export const recusarAction = async (token: string, motivo: string): Promise<R> => tentar(async () => (await recusar(token, String(motivo ?? "")), {}));
