import { NextResponse } from "next/server";
import { segredoConfere } from "@/lib/seguranca";
import { createAdminClient } from "@/lib/supabase/admin";

// Lista dos processos que os robôs próprios devem ler: só número e situação (sem dado de cliente).
// GET com "Authorization: Bearer $ROBOS_SEGREDO".
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const segredo = process.env.ROBOS_SEGREDO;
  if (!segredoConfere(request.headers.get("authorization"), segredo ? `Bearer ${segredo}` : null)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await createAdminClient().from("processes").select("numero_processo, status, ultimo_andamento_em").neq("status", "arquivado").limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const processos = (data ?? []).filter((p) => /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(p.numero_processo ?? ""));
  return NextResponse.json({ processos, sem_numero_cnj: (data ?? []).length - processos.length });
}
