import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/seguranca";
import { sincronizarLote } from "@/lib/marcas/sincronizar";

// Conferência no pePI de UMA marca (a conferida há mais tempo). Chamada pela
// VPS de madrugada, uma a cada 30 s, até passar a carteira toda (o pePI
// bloqueia o IP quando recebe consultas em sequência).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await sincronizarLote(1, 50_000, 0);
  // 503 = a ponte/INPI falhou (a VPS para a rodada)
  return NextResponse.json(r, { status: r.feitas === 0 && r.erros.some((e) => /Ponte|fetch|INPI respondeu/.test(e)) ? 503 : 200 });
}
