import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { linkDoAudio } from "@/lib/transcricao";
import type { AtaRow } from "@/lib/atas/gerar";
import type { Alerta, StatusAta } from "@/lib/atas/formato";
import { assinaturasAction } from "../actions";
import { AtaDetalhe } from "./ata-detalhe";

export const metadata = { title: "Ata" };

// Uma ata: acompanha a geração, revisão (texto editável, minutos que tocam
// a gravação, conferência da IA), aprovação e as assinaturas.
export default async function AtaPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await exigirPermissao("atas");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db.from("atas").select("*, clients(name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const ata = data as AtaRow & { status: StatusAta; alertas: Alerta[]; erro: string | null; versao: number; correcao: string | null; pdf_final_path: string | null; pdf_hash: string | null; clients: { name: string } | null };
  const [{ data: t }, assinaturas] = await Promise.all([
    ata.transcricao_id ? db.from("transcricoes").select("texto, duracao_seg").eq("id", ata.transcricao_id).maybeSingle() : Promise.resolve({ data: null }),
    assinaturasAction(id),
  ]);
  const comAudio = ["gravando", "processando", "rascunho", "erro"].includes(ata.status) && !!ata.transcricao_id;
  let audio: string | null = null;
  try {
    audio = comAudio && t?.texto ? linkDoAudio(ata.transcricao_id!) : null;
  } catch {
    audio = null;
  }
  return (
    <AtaDetalhe
      key={`${ata.status}-${ata.versao}`}
      ata={{
        id: ata.id,
        tipo: ata.tipo,
        titulo: ata.titulo,
        data_reuniao: ata.data_reuniao,
        local: ata.local,
        pauta: ata.pauta,
        participantes: ata.participantes ?? [],
        status: ata.status,
        erro: ata.erro,
        texto: ata.texto,
        alertas: ata.alertas ?? [],
        versao: ata.versao,
        correcao: ata.correcao,
        cliente: ata.clients?.name ?? null,
        temFinal: !!ata.pdf_final_path,
        hash: ata.pdf_hash,
      }}
      transcricao={(t as { texto: string | null } | null)?.texto ?? null}
      duracao={(t as { duracao_seg: number | null } | null)?.duracao_seg ?? null}
      audio={audio}
      assinaturas={assinaturas}
      meuNome={profile.full_name}
    />
  );
}
