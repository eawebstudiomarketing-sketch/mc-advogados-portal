import { NextResponse } from "next/server";
import { sincronizarAstrea } from "@/lib/andamentos/sync";

import { cronAutorizado } from "@/lib/seguranca";
// Andamentos: lê os processos que mexeram desde a última leitura e grava os
// andamentos novos (aviso para a equipe). GitHub Actions de hora em hora
// (07h–22h da Bahia, .github/workflows/andamentos.yml); o botão "Ler agora"
// da tela Andamentos também chama.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const origem = new URL(request.url).searchParams.get("origem") === "manual" ? "manual" : "cron";
  const r = await sincronizarAstrea({ origem });
  return NextResponse.json({ ok: !r.erro, ...r }, { status: r.erro ? 500 : 200 });
}
