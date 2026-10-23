import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { processarAta } from "@/lib/atas/gerar";

// Gera a ata depois que a gravação foi fechada: responde na hora e roda em
// segundo plano (transcrição em trechos paralelos + ata + conferência). A tela
// da ata acompanha pelo status. Até 5 min.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("atas");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Ata inválida." }, { status: 400 });
  // lê com o login da pessoa: só o dono (ou admin) consegue
  const { data: ata } = await ((await createClient()) as unknown as SupabaseClient).from("atas").select("id, status").eq("id", id).maybeSingle();
  if (!ata) return NextResponse.json({ error: "Ata não encontrada." }, { status: 404 });
  if (!["processando", "erro", "rascunho"].includes(ata.status)) return NextResponse.json({ error: "Feche a gravação antes de gerar a ata." }, { status: 409 });
  after(() => processarAta(id).catch(() => {}));
  return NextResponse.json({ ok: true });
}
