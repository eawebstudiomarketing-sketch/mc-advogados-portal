import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/seguranca";
import { processarCobrancas } from "@/lib/cobrancas";

// Cobrança de documento (03/11/2026): de hora em hora (GitHub Actions, junto da
// Distribuição) manda as cobranças vencidas no WhatsApp do cliente. Só em dia
// útil e dentro do horário configurado; fora dele, não faz nada.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await processarCobrancas();
  return NextResponse.json({ ok: true, ...r });
}
