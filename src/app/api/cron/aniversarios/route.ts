import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/seguranca";
import { enfileirarAniversariosDoDia } from "@/lib/zap/aniversarios";

// Parabéns de aniversário no WhatsApp às 09h da Bahia (12h UTC), só se o admin
// ligou em Contatos → Aniversários. Não manda duas vezes no mesmo ano.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await enfileirarAniversariosDoDia();
  return NextResponse.json({ ok: true, ...r });
}
