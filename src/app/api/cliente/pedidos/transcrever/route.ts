import { NextResponse } from "next/server";
import { requireRole } from "@/lib/dal";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";

// Pedido do cliente falado: o navegador grava, manda aqui e o Gemini devolve
// um título curto + a transcrição, que preenchem o formulário pra ele conferir.
// O áudio em si só é guardado se ele enviar o pedido (vai junto, como documento).
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // limite do corpo da requisição na Vercel (~4,5 MB)

const SYSTEM = `Você recebe o áudio de um CLIENTE de um escritório de advocacia empresarial fazendo um pedido ao escritório.
Devolva:
- "titulo": resumo do pedido em até 10 palavras, começando por verbo ou substantivo (ex.: "Revisar contrato com fornecedor novo"), sem ponto final.
- "resposta": a transcrição fiel do que foi dito, em português do Brasil com acentuação correta. Não resuma, não interprete, não invente. Mantenha nomes, datas, prazos, valores e números. Tire só hesitações e vícios de fala ("é…", "né", "tipo").
Se o áudio estiver vazio ou inaudível, devolva os dois campos vazios.`;

const SCHEMA = {
  type: "object",
  properties: { titulo: { type: "string" }, resposta: { type: "string" } },
  required: ["titulo", "resposta"],
};

export async function POST(request: Request) {
  await requireRole(["client"]);
  const form = await request.formData();
  const audio = form.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Nenhum áudio recebido." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "Áudio longo demais. Grave até uns 4 minutos." }, { status: 413 });
  }
  const mimeType = (audio.type || "audio/webm").split(";")[0].trim();
  if (!mimeType.startsWith("audio/")) {
    return NextResponse.json({ error: "Formato de áudio não suportado." }, { status: 400 });
  }

  const bytes = Buffer.from(await audio.arrayBuffer());
  const result = await generateJson<{ titulo: string; resposta: string }>({
    model: MODELOS.transcricao,
    system: SYSTEM,
    schema: SCHEMA,
    parts: [{ text: "Transcreva o pedido." }, { inlineData: { mimeType, data: bytes.toString("base64") } }],
  });
  if (!result.ok) return NextResponse.json({ error: "Não foi possível transcrever agora. Tente de novo." }, { status: 502 });

  const resposta = result.data.resposta?.trim() ?? "";
  if (!resposta) return NextResponse.json({ error: "Não deu para entender o áudio. Tente gravar de novo." }, { status: 422 });
  return NextResponse.json({ resposta, titulo: (result.data.titulo ?? "").trim().slice(0, 140) });
}
