import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/seguranca";
import { verificarSinais } from "@/lib/robos/saude";

// Vigia dos robôs: de hora em hora (GitHub Actions, .github/workflows/saude-robos.yml).
// Robô que passou do seu intervalo sem dar sinal vira "fora do ar" (card vermelho + e-mail).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const avisos = await verificarSinais();
  return NextResponse.json({ ok: true, avisos });
}
