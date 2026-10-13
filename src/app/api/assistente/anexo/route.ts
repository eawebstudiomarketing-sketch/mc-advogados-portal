import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { exigirPermissao } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { PREFIXO_ANEXOS } from "@/lib/assistente/tools";

// Anexo do assistente (📎): devolve uma URL assinada para o navegador enviar o
// arquivo DIRETO ao Storage (sem o limite de 4,5 MB da Vercel). O arquivo fica
// em internal/chat/{profileId}/ e é apagado em 7 dias se não for guardado num
// cliente (limpeza no cron diário).
const MAX_BYTES = 15 * 1024 * 1024; // o Gemini lê arquivos de até ~15 MB direto

const sanitizar = (nome: string) => nome.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120);

export async function POST(request: Request) {
  const { profile: profile } = await exigirPermissao("assistente");
  const body = (await request.json().catch(() => null)) as { nome?: string; tamanho?: number } | null;
  const nome = sanitizar(String(body?.nome ?? "arquivo"));
  if (!body?.tamanho || body.tamanho > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo grande demais (máx. 15 MB)." }, { status: 413 });
  }
  const caminho = `${PREFIXO_ANEXOS}/${profile.id}/${randomUUID()}-${nome}`;
  const { data, error } = await createAdminClient().storage.from("documents").createSignedUploadUrl(caminho);
  if (error || !data) return NextResponse.json({ error: "Não foi possível preparar o envio." }, { status: 500 });
  return NextResponse.json({ caminho, token: data.token });
}
