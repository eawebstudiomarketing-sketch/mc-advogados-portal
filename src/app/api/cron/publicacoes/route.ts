import { NextResponse } from "next/server";
import { executarMonitor } from "@/lib/publicacoes/monitor";

// Monitor de publicações: GitHub Actions a cada 2h (06h–22h da Bahia,
// .github/workflows/publicacoes.yml) + Vercel Cron 07h/13h de reserva (vercel.json).
// Roda na região gru1 (São Paulo): o DJEN recusa (403) acesso vindo de fora do
// Brasil. O botão "Buscar agora" também chama esta rota, com ?origem=manual.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origem = new URL(request.url).searchParams.get("origem") === "manual" ? "manual" : "cron";
  const r = await executarMonitor(origem);
  return NextResponse.json({ ok: !r.erro, ...r }, { status: r.erro ? 500 : 200 });
}
