"use server";

import { excluirAtividades } from "@/lib/lixeira-atividades";
import { registrarAnexo } from "@/lib/anexos-atividade";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole, exigirPermissao } from "@/lib/dal";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import { ACTIVITY_STATUSES } from "@/lib/activity-status";
import type { Database } from "@/lib/supabase/types";
import { destinoDeVolta } from "@/lib/voltar";
import { reagendarAudienciaDaAtividade } from "@/lib/zap/lembretes";
import { cancelarPendentes, destinoDoCliente } from "@/lib/zap/fila";
import { criarAgendamento, proximaOcorrencia, type Recorrencia } from "@/lib/zap/agendamentos";
import { configCobranca } from "@/lib/cobrancas";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehPrazoTravado, MSG_TRAVADO } from "@/lib/prazo-pedidos";

type Db = Awaited<ReturnType<typeof createClient>>;

const CATEGORIAS = ["tarefa", "prazo", "audiencia"];

/** Categoria e hora da agenda — só mexe se os campos vieram no formulário (a mini tela não manda). */
function lerAgenda(formData: FormData): { categoria?: string; hora?: string | null; area?: string | null } {
  const out: { categoria?: string; hora?: string | null; area?: string | null } = {};
  if (formData.has("area")) out.area = String(formData.get("area") ?? "").trim() || null;
  const categoria = formData.get("categoria");
  if (typeof categoria === "string" && CATEGORIAS.includes(categoria)) out.categoria = categoria;
  // tipo Audiência (04/11/2026) sempre entra na Agenda como audiência (lembretes ao cliente)
  if (formData.get("type") === "audiencia") out.categoria = "audiencia";
  if (formData.has("hora")) {
    const hora = String(formData.get("hora") ?? "");
    out.hora = /^\d{2}:\d{2}$/.test(hora) ? hora : null; // horário em qualquer atividade (pedido de 20/10)
  }
  return out;
}

// Etiquetas escolhidas no formulário. undefined = o campo não veio.
function lerEtiquetas(formData: FormData): string[] | undefined {
  if (!formData.get("etiquetas_presente")) return undefined;
  return [...new Set(formData.getAll("etiquetas").filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)))];
}

// Envolvidos (além do responsável): ids da tabela responsaveis que existem.
// undefined = o campo não veio no formulário (não mexe).
async function lerEnvolvidos(supabase: Db, formData: FormData): Promise<string[] | undefined> {
  if (!formData.get("envolvidos_presente")) return undefined;
  const ids = [...new Set(formData.getAll("envolvidos").filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)))];
  if (!ids.length) return [];
  const { data } = await supabase.from("responsaveis").select("id").in("id", ids);
  return (data ?? []).map((r) => r.id);
}

// Responsável escolhido (tabela responsaveis: equipe com login ou só nome+Gmail).
// Quando a pessoa tem login, o responsible_id (dono/autor no banco) acompanha.
async function lerResponsavel(
  supabase: Db,
  escolhido: FormDataEntryValue | null
): Promise<{ responsavel_id: string; responsible_id?: string } | null | undefined> {
  if (typeof escolhido !== "string" || !escolhido) return undefined; // não veio no formulário
  const { data } = await supabase.from("responsaveis").select("id, profile_id").eq("id", escolhido).maybeSingle();
  if (!data) return null; // inválido
  return data.profile_id ? { responsavel_id: data.id, responsible_id: data.profile_id } : { responsavel_id: data.id };
}

export type CreateActivityState = { error: string | null };

export async function createActivityAction(
  _prevState: CreateActivityState,
  formData: FormData
): Promise<CreateActivityState> {
  const profile = await requireRole(["admin", "advogado"]);

  const clientId = formData.get("client_id");
  const title = formData.get("title");
  const description = formData.get("description");
  const type = formData.get("type");
  const deadline = formData.get("deadline");

  // cliente é opcional (tarefa interna do escritório); só quem vem de publicação precisa dele
  const clienteDaAtividade = typeof clientId === "string" && clientId ? clientId : null;
  if (!clienteDaAtividade && formData.get("publicacao_id")) {
    return { error: "Selecione o cliente desta publicação." };
  }
  if (typeof title !== "string" || !title.trim()) {
    return { error: "Informe o título da atividade." };
  }
  if (typeof type !== "string" || !ACTIVITY_TYPES.includes(type as never)) {
    return { error: "Selecione o tipo de atividade." };
  }
  // depende de documento do cliente: cobra no WhatsApp até chegar (03/11/2026)
  const cobrar = formData.get("cobrar_documentos") === "on";
  const docsCobrar = [...new Set(String(formData.get("documentos_cobrar") ?? "").split(/[,;\n]/).map((d) => d.trim().slice(0, 120)).filter(Boolean))].slice(0, 20);
  const destinoCobranca = ["auto", "grupo", "numero"].includes(String(formData.get("destino_cobranca"))) ? (String(formData.get("destino_cobranca")) as "auto" | "grupo" | "numero") : "auto";
  if (cobrar && !clienteDaAtividade) return { error: "Para cobrar documento, escolha o cliente da atividade." };
  if (cobrar && !docsCobrar.length) return { error: "Diga quais documentos faltam (separe por vírgula)." };

  // mensagem automática no WhatsApp do cliente (04/11/2026): confere tudo antes de criar a atividade
  let zap: { destino: { para: string; rotulo: string }; texto: string; recorrencia: Recorrencia; hora: string } | null = null;
  if (formData.get("zap_auto") === "on") {
    const texto = String(formData.get("zap_texto") ?? "").trim();
    const data = String(formData.get("zap_data") ?? "");
    const hora = String(formData.get("zap_hora") ?? "");
    const rep = String(formData.get("zap_repeticao") ?? "unica");
    if (!clienteDaAtividade) return { error: "Para a mensagem automática no WhatsApp, escolha o cliente da atividade." };
    if (!texto) return { error: "Escreva a mensagem automática do WhatsApp (ou use Escrever com IA)." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) return { error: "Escolha o dia e o horário da mensagem automática." };
    const destino = await destinoDoCliente(clienteDaAtividade);
    if (!destino) return { error: "Este cliente não tem WhatsApp vinculado (grupo, contato ou número na ficha)." };
    const semana = new Date(`${data}T12:00:00Z`).getUTCDay();
    const recorrencia: Recorrencia =
      rep === "uteis" ? { tipo: "diaria", uteis: true, inicio: data } : rep === "semanal" ? { tipo: "semanal", dias: [semana], inicio: data } : rep === "mensal" ? { tipo: "mensal", dia: Number(data.slice(8)), inicio: data } : { tipo: "unica", data };
    if (!proximaOcorrencia(recorrencia, hora, new Date())) return { error: "O dia e o horário da mensagem automática já passaram." };
    zap = { destino, texto, recorrencia, hora };
  }

  const supabase = await createClient();
  const responsavel = await lerResponsavel(supabase, formData.get("responsavel_id"));
  if (responsavel === null) return { error: "Responsável inválido." };
  const envolvidos = await lerEnvolvidos(supabase, formData);
  const etiquetas = lerEtiquetas(formData);
  const { data: criada, error } = await supabase.from("activities").insert({
    ...(etiquetas ? { etiquetas } : {}),
    ...(envolvidos ? { envolvidos: envolvidos.filter((e) => e !== responsavel?.responsavel_id) } : {}),
    client_id: clienteDaAtividade,
    responsible_id: responsavel?.responsible_id ?? profile.id,
    ...(responsavel ? { responsavel_id: responsavel.responsavel_id } : {}),
    title: title.trim(),
    description: typeof description === "string" && description.trim() ? description.trim() : null,
    type: type as Database["public"]["Enums"]["activity_type"],
    deadline: typeof deadline === "string" && deadline ? deadline : null,
    ...lerAgenda(formData),
  }).select("id").single();

  if (error) {
    return { error: "Não foi possível salvar a atividade. Tente novamente." };
  }

  if (zap && criada) {
    await criarAgendamento({ para: zap.destino.para, rotulo: zap.destino.rotulo, texto: zap.texto, recorrencia: zap.recorrencia, hora: zap.hora, criadoPor: profile.id, activityId: criada.id }).catch((e) =>
      console.error("mensagem automática da atividade:", (e as Error).message)
    );
  }

  if (cobrar && criada && clienteDaAtividade) {
    const cfg = await configCobranca();
    await (supabase as unknown as SupabaseClient)
      .from("cobrancas_documentos")
      .insert({ activity_id: criada.id, client_id: clienteDaAtividade, documentos: docsCobrar, mensagem: cfg.mensagem, destino: destinoCobranca, intervalo_dias: cfg.intervaloDias, ativa: true, proxima_em: new Date().toISOString(), criado_por: profile.id })
      .then(({ error: e }) => e && console.error("cobrança de documento:", e.message));
  }

  // anexos escolhidos no formulário (06/11/2026): já subiram para a pasta da pessoa; aqui entram na atividade
  if (criada) {
    for (const bruto of formData.getAll("anexos").slice(0, 30)) {
      try {
        const a = JSON.parse(String(bruto)) as { caminho?: string; nome?: string; interno?: boolean };
        if (typeof a.caminho !== "string" || typeof a.nome !== "string") continue;
        await registrarAnexo({ atividade: { id: criada.id, client_id: clienteDaAtividade }, caminho: a.caminho, nome: a.nome, interno: a.interno !== false, profileId: profile.id, pendente: profile.id });
      } catch (e) {
        console.error("anexo da nova atividade:", (e as Error).message);
      }
    }
  }

  // audiência: avisa o cliente (criação, 5 dias e 1 dia antes) — só se for categoria Audiência com data e horário
  if (criada) await reagendarAudienciaDaAtividade(criada.id, { criacao: true, criadoPor: profile.id }).catch(() => undefined);

  // Veio de uma publicação do DJEN: ela passa a "tratada" e aponta para a atividade.
  const publicacaoId = formData.get("publicacao_id");
  if (typeof publicacaoId === "string" && publicacaoId && criada) {
    await supabase
      .from("publicacoes")
      .update({
        status: "tratada",
        activity_id: criada.id,
        tratada_por: profile.id,
        tratada_em: new Date().toISOString(),
        // qual sugestão foi usada (prazo/audiência) — base da % de uso
        sugestao_aceita: ["prazo", "audiencia"].includes(String(formData.get("sugestao"))) ? String(formData.get("sugestao")) : null,
      })
      .eq("id", publicacaoId);
    revalidatePath("/admin/publicacoes");
  }

  // Veio do "Tratar andamento ▾" de um andamento: ele fica como tratado (o alerta segue até "Concluir").
  const andamentoId = formData.get("andamento_id");
  if (typeof andamentoId === "string" && /^[0-9a-f-]{36}$/i.test(andamentoId) && criada) {
    await supabase
      .from("andamentos")
      .update({ acao: "Tarefa adicionada", acao_em: new Date().toISOString(), acao_por: profile.id, activity_id: criada.id })
      .eq("id", andamentoId);
    revalidatePath("/admin/alertas", "layout");
  }

  // Veio dos andamentos de um processo: os não tratados dele passam a tratados.
  const andamentosProcesso = formData.get("andamentos_processo");
  if (typeof andamentosProcesso === "string" && /^[0-9a-f-]{36}$/i.test(andamentosProcesso) && criada) {
    await supabase
      .from("andamentos")
      .update({ situacao: "tratado", activity_id: criada.id, tratado_por: profile.id, tratado_em: new Date().toISOString() })
      .eq("process_id", andamentosProcesso)
      .eq("situacao", "novo");
    revalidatePath("/admin/alertas", "layout");
  }

  revalidatePath("/admin/activities");
  redirect(destinoDeVolta(formData, "/admin/activities"));
}

export async function updateActivityStatusAction(formData: FormData): Promise<void> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const status = formData.get("status");

  if (typeof id !== "string" || !id) return;
  if (typeof status !== "string" || !ACTIVITY_STATUSES.includes(status as never)) return;

  const supabase = await createClient();
  await supabase
    .from("activities")
    .update({ status: status as Database["public"]["Enums"]["activity_status"] })
    .eq("id", id);
  await reagendarAudienciaDaAtividade(id).catch(() => undefined); // concluída/cancelada → lembretes saem da fila

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
}

export type UpdateActivityState = { error: string | null };

// Núcleo da edição: usado pela página de edição e pela mini tela da atividade.
async function salvarAtividade(formData: FormData): Promise<string | null> {
  await requireRole(["admin", "advogado"]);

  const id = formData.get("id");
  const title = formData.get("title");
  const description = formData.get("description");
  const type = formData.get("type");
  const deadline = formData.get("deadline");

  if (typeof id !== "string" || !id) return "Atividade inválida.";
  if (typeof title !== "string" || !title.trim()) return "Informe o título da atividade.";
  if (typeof type !== "string" || !ACTIVITY_TYPES.includes(type as never)) return "Selecione o tipo de atividade.";

  const supabase = await createClient();
  const responsavel = await lerResponsavel(supabase, formData.get("responsavel_id"));
  if (responsavel === null) return "Responsável inválido.";
  const envolvidos = await lerEnvolvidos(supabase, formData);
  const status = formData.get("status");
  const { error } = await supabase
    .from("activities")
    .update({
      ...(responsavel ?? {}),
      ...(envolvidos ? { envolvidos: envolvidos.filter((e) => e !== responsavel?.responsavel_id) } : {}),
      ...(lerEtiquetas(formData) ? { etiquetas: lerEtiquetas(formData) } : {}),
      ...(typeof status === "string" && ACTIVITY_STATUSES.includes(status as never)
        ? { status: status as Database["public"]["Enums"]["activity_status"] }
        : {}),
      title: title.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
      type: type as Database["public"]["Enums"]["activity_type"],
      // prazo travado (05/11/2026): sem o campo no formulário, o prazo não muda
      ...(formData.has("deadline") ? { deadline: typeof deadline === "string" && deadline ? deadline : null } : {}),
      ...lerAgenda(formData),
    })
    .eq("id", id);

  if (error) return ehPrazoTravado(error.message) ? MSG_TRAVADO : "Não foi possível salvar as alterações. Tente novamente.";
  await reagendarAudienciaDaAtividade(id).catch(() => undefined);
  revalidatePath("/admin/activities");
  revalidatePath("/admin/agenda");
  revalidatePath("/admin");
  return null;
}

export async function updateActivityAction(
  _prevState: UpdateActivityState,
  formData: FormData
): Promise<UpdateActivityState> {
  const erro = await salvarAtividade(formData);
  if (erro) return { error: erro };
  redirect(destinoDeVolta(formData, "/admin/activities"));
}

/** Mini tela: salva sem sair da tela. */
export async function saveActivityInlineAction(formData: FormData): Promise<{ error: string | null }> {
  return { error: await salvarAtividade(formData) };
}

export async function deleteActivityAction(formData: FormData): Promise<void> {
  const { profile } = await exigirPermissao("excluir");

  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;

  // 12/11/2026: vai para a Lixeira (30 dias), não some de vez; só o que a pessoa pode ver
  const supabase = await createClient();
  const { data: visivel } = await supabase.from("activities").select("id").eq("id", id).maybeSingle();
  if (visivel) await excluirAtividades([id], profile.id);
  await cancelarPendentes(`audiencia:${id}:`).catch(() => undefined);

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  redirect(destinoDeVolta(formData, "/admin/activities", id));
}

// ---------- ações em massa (lista com caixas de seleção) ----------

export type BulkResult = { ok: true; count: number } | { ok: false; error: string };

const MAX_LOTE = 500;

function idsValidos(ids: unknown): string[] | null {
  if (!Array.isArray(ids)) return null;
  const limpos = [...new Set(ids.filter((i): i is string => typeof i === "string" && /^[0-9a-f-]{36}$/i.test(i)))];
  return limpos.length && limpos.length <= MAX_LOTE ? limpos : null;
}

export async function bulkUpdateStatusAction(ids: string[], status: string): Promise<BulkResult> {
  await requireRole(["admin", "advogado"]);
  const lista = idsValidos(ids);
  if (!lista) return { ok: false, error: "Nenhuma atividade selecionada." };
  if (!ACTIVITY_STATUSES.includes(status as never)) return { ok: false, error: "Status inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({ status: status as Database["public"]["Enums"]["activity_status"] })
    .in("id", lista)
    .select("id");
  if (error) return { ok: false, error: "Não foi possível mudar o status. Tente novamente." };
  await Promise.all(lista.map((aid) => reagendarAudienciaDaAtividade(aid).catch(() => undefined)));

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { ok: true, count: data?.length ?? 0 };
}

export async function bulkUpdateDeadlineAction(ids: string[], deadline: string | null): Promise<BulkResult> {
  await requireRole(["admin", "advogado"]);
  const lista = idsValidos(ids);
  if (!lista) return { ok: false, error: "Nenhuma atividade selecionada." };
  if (deadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return { ok: false, error: "Data inválida." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("activities").update({ deadline }).in("id", lista).select("id");
  if (error) return { ok: false, error: ehPrazoTravado(error.message) ? MSG_TRAVADO : "Não foi possível mudar o prazo. Tente novamente." };

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { ok: true, count: data?.length ?? 0 };
}

// Documentos anexados às atividades saem junto (cascata) e vão para a Lixeira.
export async function bulkDeleteActivitiesAction(ids: string[]): Promise<BulkResult> {
  const { profile } = await exigirPermissao("excluir");
  const lista = idsValidos(ids);
  if (!lista) return { ok: false, error: "Nenhuma atividade selecionada." };

  // podia ver? (a exclusão passa pela chave de serviço; confere pelo acesso da pessoa)
  const supabase = await createClient();
  const { data: visiveis } = await supabase.from("activities").select("id").in("id", lista);
  const r = await excluirAtividades((visiveis ?? []).map((x) => x.id), profile.id);
  if (r.erro) return { ok: false, error: r.erro };

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { ok: true, count: r.excluidas };
}

export async function bulkArchiveActivitiesAction(ids: string[], arquivar: boolean): Promise<BulkResult> {
  await requireRole(["admin", "advogado"]);
  const lista = idsValidos(ids);
  if (!lista) return { ok: false, error: "Nenhuma atividade selecionada." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activities")
    .update({ archived_at: arquivar ? new Date().toISOString() : null })
    .in("id", lista)
    .select("id");
  if (error) return { ok: false, error: "Não foi possível arquivar. Tente novamente." };

  revalidatePath("/admin/activities");
  revalidatePath("/admin");
  return { ok: true, count: data?.length ?? 0 };
}
