"use server";

import { excluirAtividades } from "@/lib/lixeira-atividades";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehSuperAdmin, exigirPermissao, getPermissoes, requireRole } from "@/lib/dal";
import { getActivity } from "@/lib/data/activities";
import { nomeResponsavel } from "@/lib/responsavel-nome";
import { listEtiquetas, type Etiqueta } from "@/lib/data/etiquetas";
import { anexosDaAtividade, type Anexo } from "@/lib/anexos-atividade";
import { listResponsaveis, type Responsavel } from "@/lib/data/responsaveis";
import type { Database } from "@/lib/supabase/types";
import { lerChecklist, type ItemChecklist } from "@/lib/checklist";
import { getHistorico, type EventoHistorico } from "@/lib/data/historico";
import { pedidoPendente } from "@/lib/prazo-pedidos";

// Ações da mini tela da atividade (abre por cima de qualquer lista/quadro).

export type AtividadeDetalhe = {
  id: string;
  title: string;
  description: string | null;
  type: Database["public"]["Enums"]["activity_type"];
  status: Database["public"]["Enums"]["activity_status"];
  deadline: string | null;
  hora: string | null;
  categoria: string | null;
  created_at: string;
  archived_at: string | null;
  cliente_avisado_em: string | null;
  client_id: string;
  cliente: string | null;
  responsavel_id: string | null;
  responsavel: string | null;
  envolvidos: string[];
  etiquetas: string[];
  checklist: ItemChecklist[];
  historico: EventoHistorico[];
  etiquetasTodas: Etiqueta[];
  /** anexos da atividade (06/11/2026: inclui internos e atividade sem cliente) */
  documentos: Anexo[];
  /** Documentos do cliente que ainda não estão nesta atividade (para anexar). */
  docsDoCliente: { id: string; title: string }[];
  responsaveis: Responsavel[];
  pode: { excluir: boolean; verCliente: boolean; documentos: boolean; salvarModeloAviso: boolean; mudarPrazo: boolean };
  /** pedido de mudança de prazo aguardando o Dr. Maurício (05/11/2026); id vazio = de outra pessoa */
  pedidoPrazo: { id: string; prazo_novo: string | null } | null;
  /** processo da atividade (12/11/2026): pelo andamento/publicação que a gerou ou pelo número citado */
  processo: { id: string; numero: string } | null;
};

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

async function processoDaAtividade(supabase: Awaited<ReturnType<typeof createClient>>, a: { id: string; client_id: string | null; title: string; description: string | null }) {
  const [{ data: and }, { data: pub }] = await Promise.all([
    supabase.from("andamentos").select("process_id").eq("activity_id", a.id).limit(1),
    supabase.from("publicacoes").select("process_id").eq("activity_id", a.id).not("process_id", "is", null).limit(1),
  ]);
  let pid = and?.[0]?.process_id ?? pub?.[0]?.process_id ?? null;
  if (pid) {
    const { data } = await supabase.from("processes").select("id, numero_processo").eq("id", pid).maybeSingle();
    return data ? { id: data.id, numero: data.numero_processo ?? "" } : null;
  }
  // número CNJ citado no título ou na descrição: procura entre os processos do cliente
  const texto = `${a.title} ${a.description ?? ""}`;
  const cnjs = [...texto.matchAll(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}/g)].map((m) => soDigitos(m[0]));
  if (!cnjs.length || !a.client_id) return null;
  const { data: procs } = await supabase.from("processes").select("id, numero_processo").eq("client_id", a.client_id);
  const achou = (procs ?? []).find((p) => cnjs.includes(soDigitos(p.numero_processo)));
  pid = achou?.id ?? null;
  return achou && pid ? { id: pid, numero: achou.numero_processo ?? "" } : null;
}

export async function getActivityDetailAction(id: string): Promise<{ ok: true; data: AtividadeDetalhe } | { ok: false; error: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const a = await getActivity(id);
  if (!a) return { ok: false, error: "Atividade não encontrada (pode ter sido excluída)." };

  const supabase = await createClient();
  const perms = await getPermissoes();
  const [etiquetasTodas, documentos, responsaveis, { data: docsCliente }, historico, pedidoPrazo] = await Promise.all([
    listEtiquetas(),
    anexosDaAtividade(id, profile.id),
    listResponsaveis(),
    supabase
      .from("documents")
      .select("id, title")
      .eq("client_id", a.client_id)
      .or(`activity_id.is.null,activity_id.neq.${id}`)
      .order("created_at", { ascending: false })
      .limit(300),
    ehSuperAdmin(profile) ? getHistorico("activities", id, 20) : Promise.resolve([]),
    pedidoPendente(id).catch(() => null),
  ]);
  const processo = await processoDaAtividade(supabase, a).catch(() => null);

  return {
    ok: true,
    data: {
      id: a.id,
      title: a.title,
      description: a.description,
      type: a.type,
      status: a.status,
      deadline: a.deadline,
      hora: a.hora,
      categoria: a.categoria ?? null,
      created_at: a.created_at,
      archived_at: a.archived_at,
      cliente_avisado_em: a.cliente_avisado_em,
      client_id: a.client_id,
      cliente: a.clients?.name ?? null,
      responsavel_id: a.responsavel_id,
      responsavel: nomeResponsavel(a),
      envolvidos: a.envolvidos ?? [],
      etiquetas: a.etiquetas ?? [],
      checklist: lerChecklist(a.checklist),
      historico,
      etiquetasTodas,
      documentos,
      docsDoCliente: docsCliente ?? [],
      responsaveis,
      pode: { excluir: !!perms?.excluir, verCliente: !!perms?.clientes, documentos: !!perms?.documentos, salvarModeloAviso: profile.role === "admin", mudarPrazo: ehSuperAdmin(profile) },
      processo,
      pedidoPrazo: pedidoPrazo ? { id: pedidoPrazo.pedido_por === profile.id ? pedidoPrazo.id : "", prazo_novo: pedidoPrazo.prazo_novo } : null,
    },
  };
}

export async function deleteActivityInlineAction(id: string): Promise<{ error: string | null }> {
  const { profile } = await exigirPermissao("excluir");
  const supabase = await createClient();
  const { data: visivel } = await supabase.from("activities").select("id").eq("id", id).maybeSingle();
  if (!visivel) return { error: "Atividade não encontrada." };
  const r = await excluirAtividades([id], profile.id);
  if (r.erro) return { error: r.erro };
  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { error: null };
}

export async function attachDocumentInlineAction(activityId: string, documentId: string): Promise<{ error: string | null }> {
  await requireRole(["admin", "advogado"]);
  const supabase = await createClient();
  const [{ data: doc }, { data: a }] = await Promise.all([
    supabase.from("documents").select("client_id").eq("id", documentId).maybeSingle(),
    supabase.from("activities").select("client_id").eq("id", activityId).maybeSingle(),
  ]);
  if (!doc || !a || doc.client_id !== a.client_id) return { error: "Documento inválido para esta atividade." };
  const { error } = await supabase.from("documents").update({ activity_id: activityId }).eq("id", documentId);
  if (error) return { error: "Não foi possível anexar. Tente novamente." };
  revalidatePath("/admin/documents");
  return { error: null };
}

/** Cadastra responsável só com nome + Gmail (sem login). E-mail já cadastrado devolve o existente. */
export async function createResponsavelAction(
  nome: string,
  email: string
): Promise<{ ok: true; responsavel: Responsavel } | { ok: false; error: string }> {
  await requireRole(["admin", "advogado"]);
  const n = nome.trim();
  const e = email.trim().toLowerCase();
  if (n.length < 2) return { ok: false, error: "Informe o nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: "E-mail inválido." };

  const supabase = await createClient();
  const { data: existente } = await supabase.from("responsaveis").select("id, nome, email, profile_id").ilike("email", e).maybeSingle();
  if (existente) {
    return { ok: true, responsavel: { id: existente.id, nome: existente.nome, email: existente.email, temLogin: !!existente.profile_id, clientes: null } };
  }
  // alguém da equipe com esse e-mail: já nasce ligado ao login
  const { data: perfil } = await supabase.from("profiles").select("id").ilike("email", e).in("role", ["admin", "advogado"]).maybeSingle();
  const { data, error } = await supabase
    .from("responsaveis")
    .insert({ nome: n, email: e, profile_id: perfil?.id ?? null })
    .select("id, nome, email, profile_id")
    .single();
  if (error || !data) return { ok: false, error: "Não foi possível cadastrar. Tente novamente." };
  return { ok: true, responsavel: { id: data.id, nome: data.nome, email: data.email, temLogin: !!data.profile_id, clientes: null } };
}

/** Grava o checklist inteiro da atividade (marcar, incluir, tirar subtarefa). */
export async function salvarChecklistAction(id: string, itens: ItemChecklist[]): Promise<string | null> {
  await requireRole(["admin", "advogado"]);
  const lista = lerChecklist(itens).filter((x) => x.texto.trim());
  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").update({ checklist: lista }).eq("id", id).select("id");
  if (error) return "Não foi possível salvar o checklist (a atualização do banco 0059 ainda não foi aplicada?).";
  if (!data?.length) return "Atividade não encontrada.";
  revalidatePath("/admin/activities");
  return null;
}
