import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/seguranca";
import { enviarRelatorioDoDia } from "@/lib/rotina-relatorio/dia";
import { registrarAdvertencias } from "@/lib/rotina-relatorio/advertencias";

// Fim do dia: manda ao Maurício o HTML das rotinas e demandas do dia que fechou
// (GitHub Actions às 00:05 da Bahia, .github/workflows/relatorio-rotina.yml).
// ?dia=AAAA-MM-DD escolhe outro dia e ?forcar=1 manda mesmo já tendo mandado.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ontemBahia = () => {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  return new Date(Date.parse(`${hoje}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
};

export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("dia") ?? "") ? url.searchParams.get("dia")! : ontemBahia();
  const r = await enviarRelatorioDoDia(dia, { forcar: url.searchParams.get("forcar") === "1" });
  // grava as advertências de quem não enviou o relatório de ontem (19/11/2026)
  const adv = await registrarAdvertencias().then((x) => ({ advertencias: x.calculadas.length, advertenciasSalvas: x.tabela })).catch((e) => ({ advertenciasErro: String(e) }));
  return NextResponse.json({ ok: true, ...r, ...adv });
}
