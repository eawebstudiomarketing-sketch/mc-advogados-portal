import { NextResponse } from "next/server";
import { executarMonitor } from "@/lib/publicacoes/monitor";
import { classificarErro, registrarRobo } from "@/lib/robos/saude";

import { cronAutorizado } from "@/lib/seguranca";
// Monitor de publicações: GitHub Actions a cada 2h (06h–22h da Bahia,
// .github/workflows/publicacoes.yml) + Vercel Cron 07h/13h de reserva (vercel.json).
// Roda na região gru1 (São Paulo): o DJEN recusa (403) acesso vindo de fora do
// Brasil. O botão "Buscar agora" também chama esta rota, com ?origem=manual.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origem = new URL(request.url).searchParams.get("origem") === "manual" ? "manual" : "cron";
  const r = await executarMonitor(origem);
  // a cada 2 h das 06h às 22h: 6 h sem sinal (1,5 × 6 h = 9 h) cobre a noite sem alarme falso
  await registrarRobo({ robo: "publicacoes-djen", nome: "Publicações (DJEN)", grupo: "publicacoes", ok: !r.erro, motivo: r.erro ? classificarErro(r.erro) : null, detalhe: r.erro ? String(r.erro) : null, intervaloMin: 360 });
  return NextResponse.json({ ok: !r.erro, ...r }, { status: r.erro ? 500 : 200 });
}
