import { NextResponse } from "next/server";
import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { getClient } from "@/lib/data/clients";
import { atividadesDoPeriodo, pdfDoRelatorio } from "@/lib/relatorio";
import { resolverPeriodo } from "@/lib/periodo-cliente";

// PDF do relatório do período (semana/mês) que o cliente baixa no portal dele.
// Usa a sessão do próprio cliente: o banco só devolve as atividades dele.
export async function GET(request: Request) {
  const profile = await requireRole(["client"]);
  const clientId = profile.client_id!;
  const p = resolverPeriodo(new URL(request.url).searchParams.get("periodo") ?? undefined);

  const supabase = await createClient();
  const [client, atividades] = await Promise.all([getClient(clientId), atividadesDoPeriodo(supabase, clientId, p.inicio, p.fim)]);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const pdf = await pdfDoRelatorio({ clientName: client.name, mes: p.mes, ano: p.ano, periodo: { rotulo: p.rotulo, sufixo: p.sufixo }, atividades });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-${p.id}-${p.inicio}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
