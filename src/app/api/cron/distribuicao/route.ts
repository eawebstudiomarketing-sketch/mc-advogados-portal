import { NextResponse } from "next/server";
import { lerConversasDoZap } from "@/lib/distribuicao/ler-zap";
import { processarCobrancas } from "@/lib/cobrancas";

import { cronAutorizado } from "@/lib/seguranca";
// Distribuição: lê as mensagens novas dos grupos/contatos de clientes no
// WhatsApp e separa os pedidos. GitHub Actions de hora em hora (07h–21h da
// Bahia, .github/workflows/zap.yml); o botão "Ler WhatsApp agora" também chama.
// ?tarefa=cobrancas (03/11/2026): manda as cobranças de documento vencidas (só em
// dia útil, no horário do escritório). Fica nesta rota porque o plano Hobby da
// Vercel limita o número de funções por deploy.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a leitura agora também transcreve os áudios

export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (new URL(request.url).searchParams.get("tarefa") === "cobrancas") {
    return NextResponse.json({ ok: true, ...(await processarCobrancas()) });
  }
  const r = await lerConversasDoZap();
  return NextResponse.json({ ok: !r.erro, ...r }, { status: r.erro ? 500 : 200 });
}
