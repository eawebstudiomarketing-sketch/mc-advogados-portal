import "server-only";
import mammoth from "mammoth";
import type { Part } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import { downloadFile, getDriveSession } from "@/lib/google-drive";

// Transforma um documento do portal (Storage ou Google Drive) em conteúdo que
// o Gemini lê: PDF, imagem e texto vão como arquivo; Word vira texto.

const MAX_BYTES = 15 * 1024 * 1024; // limite de envio direto (inline) ao Gemini
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type DocRef = { id: string; title: string; file_path: string; drive_file_id: string | null };

async function readBytes(doc: DocRef): Promise<{ bytes: Uint8Array; mimeType: string; name: string }> {
  if (doc.drive_file_id) {
    const session = await getDriveSession();
    if (!session) throw new Error("o Google Drive não está conectado");
    const file = await downloadFile(session.token, doc.drive_file_id);
    if (!file.stream) throw new Error("arquivo vazio no Drive");
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    return { bytes, mimeType: file.mimeType, name: file.name };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("documents").download(doc.file_path);
  if (error || !data) throw new Error("arquivo não encontrado no armazenamento");
  return { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: data.type, name: doc.file_path };
}

function guessMime(mimeType: string, name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const porExt: Record<string, string> = {
    pdf: "application/pdf",
    docx: DOCX,
    txt: "text/plain",
    md: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return porExt[ext] ?? mimeType;
}

/** Partes para o Gemini, com um cabeçalho dizendo de qual documento é o conteúdo. */
export async function documentToParts(doc: DocRef, rotulo: string): Promise<Part[]> {
  const raw = await readBytes(doc);
  return bytesToParts(raw.bytes, guessMime(raw.mimeType, raw.name), `${rotulo}: ${doc.title}`);
}

export async function bytesToParts(bytes: Uint8Array, mimeType: string, cabecalho: string): Promise<Part[]> {
  if (bytes.byteLength > MAX_BYTES) throw new Error(`"${cabecalho}" passa de 15 MB`);
  const head: Part = { text: `\n--- ${cabecalho} ---` };

  if (mimeType === DOCX) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return [head, { text: value.trim() || "(documento sem texto)" }];
  }
  if (mimeType.startsWith("text/")) {
    return [head, { text: new TextDecoder().decode(bytes) }];
  }
  if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
    return [head, { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } }];
  }
  throw new Error(`o formato de "${cabecalho}" não é suportado (use PDF, Word .docx, texto ou imagem)`);
}
