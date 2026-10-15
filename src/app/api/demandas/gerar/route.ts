import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import { getClient } from "@/lib/data/clients";
import { gerarDemandasDoCliente } from "@/lib/demandas";
import { getHandoff } from "@/lib/data/handoff";

export type { DemandSource } from "@/lib/demandas";

// Geração de demandas a partir das fontes escolhidas na ficha do cliente.
// Route Handler (não Server Action) porque pode vir um arquivo junto — ver o
// motivo em app/api/documents/upload. O documento avulso fica salvo nos
// documentos do cliente (decisão do usuário, 07/10/2026). A lógica fica em
// src/lib/demandas.ts (o assistente do portal usa a mesma).
export const maxDuration = 180;

export async function POST(request: Request) {
  const { profile: profile } = await exigirPermissao("demandas", "gerar_ia");
  const form = await request.formData();

  const clientId = String(form.get("client_id") ?? "");
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });

  const file = form.get("file");
  const arquivo =
    file instanceof File && file.size > 0
      ? { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, nome: file.name }
      : undefined;

  const r = await gerarDemandasDoCliente(await createClient(), {
    client,
    ficha: await getHandoff(clientId),
    profileId: profile.id,
    usarFicha: form.get("triagem") === "on",
    onboardingIds: form.getAll("onboarding_ids").map(String).filter(Boolean),
    ataIds: form.getAll("ata_ids").map(String).filter(Boolean),
    instrucoes: String(form.get("instructions") ?? "").trim(),
    responsavelId: String(form.get("responsavel_id") ?? "") || null,
    arquivo,
  });

  revalidatePath(`/admin/clients/${clientId}`);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, generated: r.geradas });
}
