import { NextResponse } from "next/server";
import { lerConversasDoZap } from "@/lib/distribuicao/ler-zap";

// Distribuição: lê as mensagens novas dos grupos/contatos de clientes no
// WhatsApp e separa os pedidos. GitHub Actions de hora em hora (07h–21h da
// Bahia, .github/workflows/zap.yml); o botão "Ler WhatsApp agora" também chama.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await lerConversasDoZap();
  return NextResponse.json({ ok: !r.erro, ...r }, { status: r.erro ? 500 : 200 });
}
