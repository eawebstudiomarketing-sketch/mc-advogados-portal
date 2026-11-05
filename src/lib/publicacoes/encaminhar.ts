import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarAvisos } from "@/lib/avisos";

// Encaminhar publicação (05/11/2026): grava o novo dono, quem encaminhou e
// avisa a pessoa (sininho + celular). Usado pela tela e pelo Assistente.

export async function encaminharPublicacao(id: string, para: string, deId: string, deNome: string | null): Promise<{ numero: string; para: string }> {
  const db = createAdminClient();
  const [{ data: pessoa }, { data: pub }] = await Promise.all([
    db.from("profiles").select("id, full_name, role, ativo").eq("id", para).maybeSingle(),
    db.from("publicacoes").select("id, numero_mascara, numero_processo, tribunal").eq("id", id).maybeSingle(),
  ]);
  if (!pessoa?.ativo || !["admin", "advogado"].includes(pessoa.role)) throw new Error("Pessoa não encontrada na equipe.");
  if (!pub) throw new Error("Publicação não encontrada.");
  const { error } = await db
    .from("publicacoes")
    .update({ responsavel_id: para, encaminhada_por: deId, encaminhada_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  // a sugestão da Distribuição dessa publicação acompanha, se ainda não foi decidida
  const { data: resp } = await db.from("responsaveis").select("id").eq("profile_id", para).maybeSingle();
  if (resp) await db.from("distribuicao").update({ responsavel_sugerido: resp.id }).eq("publicacao_id", id).eq("status", "pendente");
  const numero = pub.numero_mascara ?? pub.numero_processo;
  if (para !== deId) {
    await criarAvisos([
      {
        profile_id: para,
        tipo: "publicacao_encaminhada",
        titulo: `📰 ${deNome ?? "Alguém"} te encaminhou uma publicação`,
        corpo: `${pub.tribunal ?? ""} · Processo ${numero}`,
        url: `/admin/publicacoes?p=${id}`,
      },
    ]);
  }
  return { numero, para: pessoa.full_name ?? "" };
}
