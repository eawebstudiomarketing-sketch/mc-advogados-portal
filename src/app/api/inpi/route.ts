import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/seguranca";

// Ponte do pePI (busca.inpi.gov.br) em São Paulo (31/10/2026). O pePI bloqueou o
// IP da VPS por excesso de consultas, mas responde à Vercel em gru1 (testado
// pela outra conta). Mesmo contrato da ponte da VPS (src/inpi-ponte.js do
// midia-mc): passos em sequência com os mesmos cookies, devolve a última resposta.
// Só o pePI: a revista (revistas.inpi.gov.br) dá 503 daqui e continua na VPS.
// POST com "Authorization: Bearer $CRON_SECRET".
export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";
export const maxDuration = 120;

type Passo = { url: string; metodo?: "GET" | "POST"; form?: Record<string, string> };
const MAX_PASSOS = 6;

export async function POST(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { passos, latin1 } = (await request.json().catch(() => ({}))) as { passos?: Passo[]; latin1?: boolean };
  if (!Array.isArray(passos) || !passos.length || passos.length > MAX_PASSOS) return NextResponse.json({ error: "passos inválidos" }, { status: 400 });

  const cookies = new Map<string, string>();
  let ultima: Response | null = null;
  try {
    for (const [i, p] of passos.entries()) {
      let alvo = new URL(String(p.url ?? ""));
      if (alvo.protocol !== "https:" || alvo.hostname !== "busca.inpi.gov.br") return NextResponse.json({ error: "endereço fora do pePI" }, { status: 400 });
      let metodo = p.metodo === "POST" ? "POST" : "GET";
      let corpo = metodo === "POST" && p.form ? new URLSearchParams(p.form).toString() : undefined;
      // redirecionamento à mão, para guardar os cookies de cada resposta
      for (let salto = 0; salto < 5; salto++) {
        const cab: Record<string, string> = { "User-Agent": "Mozilla/5.0 (MC Advogados)", Accept: "*/*" };
        if (cookies.size) cab.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
        if (corpo) cab["Content-Type"] = "application/x-www-form-urlencoded";
        const r = await fetch(alvo, { method: metodo, headers: cab, body: corpo, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(60_000) });
        for (const c of r.headers.getSetCookie()) {
          const [par] = c.split(";");
          const k = par.indexOf("=");
          if (k > 0) cookies.set(par.slice(0, k).trim(), par.slice(k + 1).trim());
        }
        const destino = r.headers.get("location");
        if (r.status >= 300 && r.status < 400 && destino) {
          await r.arrayBuffer();
          alvo = new URL(destino, alvo);
          if (alvo.hostname !== "busca.inpi.gov.br") return NextResponse.json({ error: "redirecionou para fora do pePI" }, { status: 502 });
          metodo = "GET";
          corpo = undefined;
          continue;
        }
        ultima = r;
        break;
      }
      if (i < passos.length - 1 && ultima) await ultima.arrayBuffer();
    }
  } catch (e) {
    const causa = (e as { cause?: { code?: string; message?: string } }).cause;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e), causa: causa?.code ?? causa?.message ?? null, regiao: process.env.VERCEL_REGION ?? null }, { status: 504 });
  }
  if (!ultima) return NextResponse.json({ error: "sem resposta" }, { status: 502 });
  const tipo = ultima.headers.get("content-type") ?? "";
  const buf = Buffer.from(await ultima.arrayBuffer());
  const binario = !/text|json|xml|html|javascript/i.test(tipo);
  return NextResponse.json(
    binario
      ? { status: ultima.status, url: ultima.url, tipo, corpoBase64: buf.toString("base64") }
      : { status: ultima.status, url: ultima.url, tipo, corpo: buf.toString(latin1 || /iso-8859-1|latin1/i.test(tipo) ? "latin1" : "utf8") }
  );
}
