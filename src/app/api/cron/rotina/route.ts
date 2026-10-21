import { NextResponse } from "next/server";
import { enfileirarRotinas } from "@/lib/zap/rotina";

// Rotina do dia no WhatsApp: às 07h45 da Bahia (seg–sex) monta a agenda de
// cada pessoa e deixa na fila do Agente para sair às 08h00. GitHub Actions
// (.github/workflows/zap.yml) + Vercel Cron de reserva; não manda duas vezes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const r = await enfileirarRotinas({ forcar: url.searchParams.get("forcar") === "1", so: url.searchParams.get("so") ?? undefined });
  return NextResponse.json({ ok: !r.erro, ...r }, { status: r.erro ? 500 : 200 });
}
