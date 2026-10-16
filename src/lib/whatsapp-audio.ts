import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { BUCKET_WHATSAPP, linkVps } from "@/lib/whatsapp";

// Áudio do WhatsApp → texto, pra IA da Distribuição entender o pedido de quem
// manda áudio. O arquivo vem do disco do VPS ("vps:...") ou, nos antigos, do
// Storage do Supabase. A transcrição não é guardada: passa só pela memória.

const MAX_BYTES = 15 * 1024 * 1024; // limite do envio direto pro Gemini (~20 MB por pedido)

const SYSTEM = `Transcreva o áudio de WhatsApp enviado a um escritório de advocacia empresarial.
- Português do Brasil com acentuação correta, fiel ao que foi dito: não resuma, não interprete, não invente.
- Mantenha nomes, datas, prazos, valores, números de processo e de documentos.
- Tire só hesitações e vícios de fala ("é…", "né", "tipo").
- Se o áudio estiver vazio ou inaudível, devolva texto vazio.`;

const SCHEMA = { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] };

async function bytesDaMidia(mediaPath: string): Promise<Buffer | null> {
  if (mediaPath.startsWith("vps:")) {
    const url = linkVps(mediaPath, { segundos: 300 });
    if (!url) return null;
    const r = await fetch(url);
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  }
  const { data } = await createAdminClient().storage.from(BUCKET_WHATSAPP).download(mediaPath);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}

/** Texto do áudio, ou null se não deu (sem arquivo, grande demais, erro do Gemini). */
export async function transcreverAudioDoZap(mediaPath: string | null, mime: string | null): Promise<string | null> {
  if (!mediaPath) return null;
  try {
    const bytes = await bytesDaMidia(mediaPath);
    if (!bytes?.length || bytes.length > MAX_BYTES) return null;
    // "audio/ogg; codecs=opus" (nota de voz do WhatsApp) → "audio/ogg"
    const mimeType = (mime || "audio/ogg").split(";")[0].trim();
    const r = await generateJson<{ texto: string }>({
      model: MODELOS.transcricao,
      system: SYSTEM,
      schema: SCHEMA,
      parts: [{ text: "Transcreva o áudio." }, { inlineData: { mimeType, data: bytes.toString("base64") } }],
    });
    return r.ok ? r.data.texto?.trim() || null : null;
  } catch {
    return null;
  }
}
