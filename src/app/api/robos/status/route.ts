import { NextResponse } from "next/server";
import { segredoConfere } from "@/lib/seguranca";
import { registrarRobo, type MotivoFalha, type Rodada } from "@/lib/robos/saude";

// Os robôs que rodam fora do portal (VPS e Vercel robo-andamentos) avisam aqui o resultado de
// cada rodada: POST {robo, nome, grupo?, ok, motivo?, detalhe?, usandoReserva?, intervaloMin?}
// ou {rodadas: [...]}. Autorização: "Authorization: Bearer $ROBOS_SEGREDO".
export const dynamic = "force-dynamic";

const MOTIVOS: MotivoFalha[] = ["captcha", "bloqueio", "fora_do_ar", "layout", "vazio", "sem_sinal", "erro"];

function valida(x: unknown): Rodada | null {
  const r = x as Record<string, unknown>;
  if (!r || typeof r.robo !== "string" || !/^[a-z0-9-]{2,40}$/.test(r.robo) || typeof r.nome !== "string" || typeof r.ok !== "boolean") return null;
  return {
    robo: r.robo,
    nome: r.nome.slice(0, 80),
    grupo: r.grupo === "publicacoes" || r.grupo === "integracoes" ? r.grupo : "andamentos",
    ok: r.ok,
    motivo: MOTIVOS.includes(r.motivo as MotivoFalha) ? (r.motivo as MotivoFalha) : r.ok ? null : "erro",
    detalhe: typeof r.detalhe === "string" ? r.detalhe.slice(0, 500) : null,
    usandoReserva: r.usandoReserva === true,
    intervaloMin: typeof r.intervaloMin === "number" && r.intervaloMin >= 10 && r.intervaloMin <= 10_080 ? r.intervaloMin : undefined,
  };
}

export async function POST(request: Request) {
  const segredo = process.env.ROBOS_SEGREDO;
  if (!segredoConfere(request.headers.get("authorization"), segredo ? `Bearer ${segredo}` : null)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const corpo = await request.json().catch(() => null);
  const lista = (Array.isArray(corpo?.rodadas) ? corpo.rodadas : [corpo]).map(valida);
  if (!lista.length || lista.some((r: Rodada | null) => !r)) return NextResponse.json({ error: "rodada inválida" }, { status: 400 });
  for (const r of lista as Rodada[]) await registrarRobo(r);
  return NextResponse.json({ ok: true, registradas: lista.length });
}
