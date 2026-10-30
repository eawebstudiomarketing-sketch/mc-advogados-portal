import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/seguranca";

// Ponte para o DJEN (30/10/2026). O DJEN recusa (403) acesso de fora do Brasil e as telas do
// portal rodam nos EUA (iad1); esta rota roda em São Paulo (gru1, vercel.json) e só repassa a
// consulta. Usada pela pesquisa de processo novo (src/lib/processos-busca/fontes.ts).
// GET com "Authorization: Bearer $CRON_SECRET"; só os parâmetros de busca abaixo passam.
export const dynamic = "force-dynamic";
export const preferredRegion = "gru1";
export const maxDuration = 30;

const PERMITIDOS = ["numeroProcesso", "nomeParte", "numeroOab", "ufOab", "itensPorPagina", "pagina", "dataDisponibilizacaoInicio", "dataDisponibilizacaoFim"];

export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const entrada = new URL(request.url).searchParams;
  const url = new URL("https://comunicaapi.pje.jus.br/api/v1/comunicacao");
  for (const k of PERMITIDOS) {
    const v = entrada.get(k);
    if (v) url.searchParams.set(k, v.slice(0, 200));
  }
  try {
    const resp = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
    return new NextResponse(await resp.text(), { status: resp.status, headers: { "content-type": "application/json" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 504 });
  }
}
