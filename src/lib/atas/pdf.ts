import "server-only";
import { createHash } from "node:crypto";
import { createElement, type ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { AtaPdf, type AssinanteNoPdf, type Registro } from "@/lib/pdf/ata";
import { blocosDaAta, blocosParaCliente, type DadosAta } from "./formato";

export type ExtrasPdf = { registro?: Registro | null; assinantes?: AssinanteNoPdf[]; rubricas?: Buffer[]; codigo?: string | null };

/** PDF da ata: "cliente" tira as seções internas; "completa" leva tudo. */
export async function pdfDaAta(dados: DadosAta, texto: string | null, versao: "cliente" | "completa", extras: ExtrasPdf = {}): Promise<Buffer> {
  const blocos = versao === "cliente" ? blocosParaCliente(blocosDaAta(texto)) : blocosDaAta(texto);
  return renderToBuffer(createElement(AtaPdf, { dados, blocos, ...extras }) as unknown as ReactElement<DocumentProps>);
}

export const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

export function nomeDoPdf(dados: DadosAta, sufixo = ""): string {
  const base = `${dados.titulo}${dados.cliente ? ` - ${dados.cliente}` : ""} - ${new Date(dados.data_reuniao).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }).replace(/\//g, "-")}`;
  return `${base.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 150)}${sufixo}.pdf`;
}
