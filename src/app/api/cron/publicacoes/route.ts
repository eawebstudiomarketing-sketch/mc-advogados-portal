import { NextResponse } from "next/server";
import { executarMonitor } from "@/lib/publicacoes/monitor";

// Monitor de publicações (Vercel Cron, 07h e 13h da Bahia — ver vercel.json).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await executarMonitor("cron");
  return NextResponse.json({ ok: !r.erro, ...r }, { status: r.erro ? 500 : 200 });
}
