import { NextResponse } from "next/server";
import { requireRole } from "@/lib/dal";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";

// Resposta do onboarding por áudio: o navegador grava, manda aqui, e o Gemini
// devolve a resposta já reescrita de forma objetiva (decisão do usuário,
// 08/10/2026: "opção B", resumo e não transcrição literal). O áudio NÃO é
// guardado: só passa por memória até o Gemini.
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // limite do corpo da requisição na Vercel (~4,5 MB)

const SYSTEM = `Você recebe a gravação de um advogado ou cliente respondendo, em voz alta, a uma pergunta de onboarding de assessoria jurídica empresarial. Escreva a RESPOSTA para o formulário:
- Objetiva e organizada, em português do Brasil com acentuação correta, frases completas e diretas.
- Mantenha todos os fatos ditos: números, nomes, prazos, valores, quantidades, problemas e exemplos. Não invente nada que não foi dito e não opine.
- Tire hesitações, repetições e vícios de fala ("é…", "né", "tipo", "então").
- Escreva de forma neutra, sobre a empresa/cliente (ex.: "A empresa tem cerca de 25 funcionários…").
- Se o áudio estiver vazio, inaudível ou não tiver relação com a pergunta, devolva resposta vazia.`;

// modo "comando": fala para o assistente do portal → vira a mensagem escrita
const SYSTEM_COMANDO = `Transcreva o pedido falado por um advogado ao assistente do sistema do escritório, para ser enviado como mensagem escrita:
- Português do Brasil com acentuação correta; mantenha o sentido e todos os detalhes (nomes de clientes, datas, prazos, números, títulos).
- Tire hesitações e vícios de fala ("é…", "né", "tipo"), mas não resuma nem reescreva o pedido.
- Se o áudio estiver vazio ou inaudível, devolva resposta vazia.`;

const SCHEMA = {
  type: "object",
  properties: { resposta: { type: "string" } },
  required: ["resposta"],
};

export async function POST(request: Request) {
  await requireRole(["admin", "advogado"]);
  const form = await request.formData();
  const audio = form.get("audio");
  const pergunta = String(form.get("pergunta") ?? "").slice(0, 600);
  const comando = form.get("modo") === "comando";

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Nenhum áudio recebido." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Áudio longo demais. Grave respostas de até uns 4 minutos." }, { status: 413 });
  }
  // "audio/webm;codecs=opus" → "audio/webm" (Chrome/Edge/Android); "audio/mp4" no Safari/iPhone
  const mimeType = (audio.type || "audio/webm").split(";")[0].trim();
  if (!mimeType.startsWith("audio/")) {
    return NextResponse.json({ error: "Formato de áudio não suportado." }, { status: 400 });
  }

  const bytes = Buffer.from(await audio.arrayBuffer());
  const result = await generateJson<{ resposta: string }>({
    model: MODELOS.transcricao,
    system: comando ? SYSTEM_COMANDO : SYSTEM,
    schema: SCHEMA,
    parts: [
      { text: comando ? "Transcreva o pedido." : `Pergunta: ${pergunta || "(sem pergunta informada)"}` },
      { inlineData: { mimeType, data: bytes.toString("base64") } },
    ],
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const resposta = result.data.resposta?.trim() ?? "";
  if (!resposta) return NextResponse.json({ error: "Não deu para entender o áudio. Tente gravar de novo." }, { status: 422 });
  return NextResponse.json({ resposta });
}
