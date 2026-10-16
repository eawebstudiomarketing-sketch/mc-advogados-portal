"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import { lerConversasDoZap } from "@/lib/distribuicao/ler-zap";
import type { Database } from "@/lib/supabase/types";

// Distribuir = escolher responsável, área e prazo. Pedido vindo do Zap vira
// atividade nova; pedido aberto pelo cliente no portal já é uma atividade e
// só recebe o responsável.

export type DistribuirState = { error: string | null; ok?: boolean };

const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export async function distribuirAction(_prev: DistribuirState, formData: FormData): Promise<DistribuirState> {
  const { profile } = await exigirPermissao("distribuicao");
  const id = texto(formData.get("id"));
  const titulo = texto(formData.get("titulo"));
  const descricao = texto(formData.get("descricao"));
  const area = texto(formData.get("area")) || null;
  const tipo = texto(formData.get("tipo"));
  const prazo = texto(formData.get("prazo")) || null;
  const responsavelId = texto(formData.get("responsavel_id"));

  if (!titulo) return { error: "Informe o título." };
  if (!responsavelId) return { error: "Escolha o responsável." };
  if (!ACTIVITY_TYPES.includes(tipo as never)) return { error: "Escolha o tipo." };

  const supabase = await createClient();
  const [{ data: item }, { data: resp }] = await Promise.all([
    supabase.from("distribuicao").select("id, origem, client_id, activity_id, status").eq("id", id).maybeSingle(),
    supabase.from("responsaveis").select("id, profile_id").eq("id", responsavelId).maybeSingle(),
  ]);
  if (!item || item.status !== "pendente") return { error: "Esta demanda já foi distribuída ou não existe mais." };
  if (!resp) return { error: "Responsável inválido." };
  if (!item.client_id) return { error: "Demanda sem cliente: crie a atividade pela tela Atividades." };

  const campos = {
    title: titulo,
    description: descricao || null,
    area,
    type: tipo as Database["public"]["Enums"]["activity_type"],
    deadline: prazo,
    responsavel_id: resp.id,
  };

  let activityId = item.activity_id;
  if (activityId) {
    // pedido do portal do cliente: a atividade já existe
    const { error } = await supabase.from("activities").update(campos).eq("id", activityId);
    if (error) return { error: "Não foi possível atualizar a atividade do pedido." };
  } else {
    const { data: criada, error } = await supabase
      .from("activities")
      .insert({ ...campos, client_id: item.client_id, responsible_id: resp.profile_id ?? profile.id })
      .select("id")
      .single();
    if (error || !criada) return { error: "Não foi possível criar a atividade." };
    activityId = criada.id;
  }

  await supabase
    .from("distribuicao")
    .update({ status: "aceita", activity_id: activityId, area, tratado_por: profile.id, tratado_em: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/admin/distribuicao");
  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { error: null, ok: true };
}

export async function mudarStatusDistribuicaoAction(formData: FormData): Promise<void> {
  const { profile } = await exigirPermissao("distribuicao");
  const status = texto(formData.get("status"));
  const ids = formData.getAll("id").map(String).filter(Boolean);
  if (!ids.length || !["pendente", "descartada"].includes(status)) return;
  const supabase = await createClient();
  await supabase
    .from("distribuicao")
    .update(status === "pendente" ? { status, tratado_por: null, tratado_em: null } : { status, tratado_por: profile.id, tratado_em: new Date().toISOString() })
    .in("id", ids)
    .neq("status", "aceita");
  revalidatePath("/admin/distribuicao");
}

export async function lerZapAgoraAction(): Promise<{ ok: boolean; mensagem: string }> {
  const { profile } = await exigirPermissao("distribuicao");
  if (profile.role !== "admin") return { ok: false, mensagem: "Só o administrador lê o WhatsApp." };
  const r = await lerConversasDoZap();
  revalidatePath("/admin/distribuicao");
  if (r.erro) return { ok: false, mensagem: `Parou com erro: ${r.erro}` };
  if (!r.conversas) return { ok: true, mensagem: "Nenhuma mensagem nova nos grupos e contatos de clientes." };
  return {
    ok: true,
    mensagem: `${r.conversas} conversa(s) lida(s), ${r.mensagens} mensagem(ns): ${r.sugestoes ? `${r.sugestoes} demanda(s) nova(s).` : "nenhum pedido novo."}`,
  };
}
