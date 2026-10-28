import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { processarAta, processarReuniao } from "@/lib/atas/gerar";

// Roda em segundo plano e responde na hora; a tela acompanha pelo status. Até 5 min.
//  etapa "reuniao" (padrão, depois de fechar a gravação): transcreve em trechos
//    paralelos e resume → reunião entregue (transcrita);
//  etapa "ata" (botão "Gerar ata"): escreve a ata da transcrição e confere.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("atas");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Ata inválida." }, { status: 400 });
  // lê com o login da pessoa: só o dono (ou admin) consegue
  const { data: ata } = await ((await createClient()) as unknown as SupabaseClient).from("atas").select("id, status").eq("id", id).maybeSingle();
  if (!ata) return NextResponse.json({ error: "Ata não encontrada." }, { status: 404 });
  const { etapa } = (await req.json().catch(() => ({}))) as { etapa?: string };
  if (etapa === "ata") {
    if (!["transcrita", "rascunho"].includes(ata.status)) return NextResponse.json({ error: "A reunião precisa estar transcrita para gerar a ata." }, { status: 409 });
    after(() => processarAta(id).catch(() => {}));
  } else {
    if (!["processando", "erro"].includes(ata.status)) return NextResponse.json({ error: "Feche a gravação antes de transcrever." }, { status: 409 });
    after(() => processarReuniao(id).catch(() => {}));
  }
  return NextResponse.json({ ok: true });
}
