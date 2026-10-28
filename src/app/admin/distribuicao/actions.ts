"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import { reagendarAudienciaDaAtividade } from "@/lib/zap/lembretes";
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
  const categoriaTxt = texto(formData.get("categoria"));
  const categoria = ["tarefa", "prazo", "audiencia"].includes(categoriaTxt) ? categoriaTxt : "tarefa";
  const horaTxt = texto(formData.get("hora"));
  const hora = prazo && /^\d{2}:\d{2}$/.test(horaTxt) ? horaTxt : null;
  const responsavelId = texto(formData.get("responsavel_id"));

  if (!titulo) return { error: "Informe o título." };
  if (categoria === "audiencia" && (!prazo || !hora)) return { error: "Para audiência, informe o dia e o horário." };
  if (!responsavelId) return { error: "Escolha o responsável." };
  if (!ACTIVITY_TYPES.includes(tipo as never)) return { error: "Escolha o tipo." };

  const supabase = await createClient();
  const [{ data: item }, { data: resp }] = await Promise.all([
    supabase.from("distribuicao").select("id, origem, client_id, activity_id, status, publicacao_id").eq("id", id).maybeSingle(),
    supabase.from("responsaveis").select("id, profile_id").eq("id", responsavelId).maybeSingle(),
  ]);
  if (!item || item.status !== "pendente") return { error: "Esta demanda já foi distribuída ou não existe mais." };
  if (!resp) return { error: "Responsável inválido." };
  const clientId = item.client_id ?? (texto(formData.get("client_id")) || null);
  if (!clientId && item.publicacao_id) return { error: "Escolha o cliente desta publicação." };

  const campos = {
    title: titulo,
    description: descricao || null,
    area,
    type: tipo as Database["public"]["Enums"]["activity_type"],
    deadline: prazo,
    ...(hora ? { hora } : {}),
    categoria,
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
      .insert({ ...campos, client_id: clientId, responsible_id: resp.profile_id ?? profile.id })
      .select("id")
      .single();
    if (error || !criada) return { error: "Não foi possível criar a atividade." };
    activityId = criada.id;
  }

  // audiência: avisa o cliente (na criação, 5 dias e 1 dia antes)
  if (activityId && categoria === "audiencia") {
    await reagendarAudienciaDaAtividade(activityId, { criacao: true, criadoPor: profile.id }).catch(() => undefined);
  }

  await supabase
    .from("distribuicao")
    .update({ status: "aceita", activity_id: activityId, area, client_id: clientId, tratado_por: profile.id, tratado_em: new Date().toISOString() })
    .eq("id", id);

  // veio de publicação: ela passa a "tratada" e aponta para a atividade
  if (item.publicacao_id) {
    await supabase
      .from("publicacoes")
      .update({ status: "tratada", activity_id: activityId, tratada_por: profile.id, tratada_em: new Date().toISOString(), client_id: clientId })
      .eq("id", item.publicacao_id);
    revalidatePath("/admin/publicacoes");
  }

  revalidatePath("/admin/distribuicao");
  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { error: null, ok: true };
}

export async function mudarStatusDistribuicaoAction(formData: FormData): Promise<void> {
  const { profile } = await exigirPermissao("distribuicao");
  const status = texto(formData.get("status"));
  const ids = [...formData.getAll("id"), ...formData.getAll("id-lote")].map(String).filter(Boolean);
  if (!ids.length || !["pendente", "descartada"].includes(status)) return;
  const supabase = await createClient();
  await supabase
    .from("distribuicao")
    .update(status === "pendente" ? { status, tratado_por: null, tratado_em: null } : { status, tratado_por: profile.id, tratado_em: new Date().toISOString() })
    .in("id", ids)
    .neq("status", "aceita");
  // descartar a sugestão de uma publicação descarta a publicação também
  if (status === "descartada") {
    const { data: pubs } = await supabase.from("distribuicao").select("publicacao_id").in("id", ids).not("publicacao_id", "is", null);
    const pubIds = (pubs ?? []).map((p) => p.publicacao_id!).filter(Boolean);
    if (pubIds.length)
      await supabase.from("publicacoes").update({ status: "descartada", tratada_por: profile.id, tratada_em: new Date().toISOString() }).in("id", pubIds).eq("status", "nao_tratada");
  }
  revalidatePath("/admin/distribuicao");
}
