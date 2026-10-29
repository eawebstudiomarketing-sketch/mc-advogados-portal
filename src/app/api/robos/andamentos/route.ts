import { NextResponse } from "next/server";
import { segredoConfere } from "@/lib/seguranca";
import { gravarDoRobo, type MovRobo } from "@/lib/andamentos/robos";

// Os robôs próprios (VPS e Vercel robo-andamentos) mandam aqui o que leram de cada processo:
// POST {processos: [{numero, sistema, movs: [{data, texto}]}]}. "Authorization: Bearer $ROBOS_SEGREDO".
// O portal grava só o que ainda não existe (ver src/lib/andamentos/robos.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const segredo = process.env.ROBOS_SEGREDO;
  if (!segredoConfere(request.headers.get("authorization"), segredo ? `Bearer ${segredo}` : null)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const corpo = await request.json().catch(() => null);
  const lista: { numero: string; sistema: string; movs: MovRobo[] }[] = Array.isArray(corpo?.processos) ? corpo.processos : [];
  if (!lista.length || lista.length > 50) return NextResponse.json({ error: "envie de 1 a 50 processos" }, { status: 400 });
  const out = [];
  for (const p of lista) {
    if (typeof p?.numero !== "string" || !Array.isArray(p.movs)) {
      out.push({ numero: p?.numero ?? null, erro: "formato inválido" });
      continue;
    }
    const movs = p.movs.filter((m) => typeof m?.data === "string" && typeof m?.texto === "string").slice(0, 3000);
    try {
      out.push({ numero: p.numero, ...(await gravarDoRobo(p.numero, String(p.sistema ?? "robo"), movs)) });
    } catch (e) {
      out.push({ numero: p.numero, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ ok: true, processos: out });
}
