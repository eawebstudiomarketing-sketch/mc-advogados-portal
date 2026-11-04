"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/dal";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { cobrancaDaAtividade, configCobranca, destinoDaCobranca, enviarCobranca, type Cobranca, type ConfigCobranca } from "@/lib/cobrancas";

// Cobrança de documento na atividade (03/11/2026): quem faz a atividade liga,
// escolhe os documentos, por onde vai (grupo ou número), de quanto em quanto
// tempo e o texto (escrito à mão ou gerado com IA). O cron manda sozinho.

const UUID = /^[0-9a-f-]{36}$/i;
const db = async () => (await createClient()) as unknown as SupabaseClient;
const adm = () => createAdminClient() as unknown as SupabaseClient;

export type TelaCobranca = {
  cobranca: (Cobranca & { recebidos: string[]; destinoRotulo: string | null }) | null;
  config: ConfigCobranca;
  atividade: { id: string; titulo: string; clienteId: string | null; cliente: string | null; status: string };
  destinos: { auto: string | null; grupo: string | null; numero: string | null };
};

export async function carregarCobrancaAction(activityId: string): Promise<TelaCobranca | null> {
  await requireRole(["admin", "advogado"]);
  if (!UUID.test(activityId)) return null;
  // a leitura passa pelas regras do banco: só abre se a pessoa pode ver a atividade
  const { data: at } = await (await db()).from("activities").select("id, title, status, client_id, clients(name)").eq("id", activityId).maybeSingle();
  if (!at) return null;
  const clienteId = (at.client_id as string | null) || null;
  const [cobranca, config, auto, grupo, numero] = await Promise.all([
    cobrancaDaAtividade(activityId),
    configCobranca(),
    clienteId ? destinoDaCobranca(clienteId, "auto") : null,
    clienteId ? destinoDaCobranca(clienteId, "grupo") : null,
    clienteId ? destinoDaCobranca(clienteId, "numero") : null,
  ]);
  return {
    cobranca,
    config,
    atividade: { id: at.id, titulo: at.title, clienteId, cliente: (at.clients as unknown as { name: string } | null)?.name ?? null, status: at.status },
    destinos: { auto: auto?.rotulo ?? null, grupo: grupo?.rotulo ?? null, numero: numero?.rotulo ?? null },
  };
}

/** Clientes para vincular a atividade (quando ela ainda não tem cliente). */
export async function clientesParaVincularAction(): Promise<{ id: string; name: string }[]> {
  await requireRole(["admin", "advogado"]);
  const { data } = await (await db()).from("clients").select("id, name").is("archived_at", null).order("name");
  return (data ?? []) as { id: string; name: string }[];
}

export async function salvarCobrancaAction(c: {
  activityId: string;
  clienteId?: string | null;
  documentos: string[];
  mensagem: string;
  destino: Cobranca["destino"];
  intervaloDias: number;
}): Promise<{ ok: boolean; erro?: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  if (!UUID.test(c.activityId)) return { ok: false, erro: "Atividade inválida." };
  const documentos = [...new Set(c.documentos.map((d) => d.trim().slice(0, 120)).filter(Boolean))].slice(0, 20);
  const mensagem = c.mensagem.trim().slice(0, 2000);
  const intervalo = Math.round(c.intervaloDias);
  if (!documentos.length) return { ok: false, erro: "Diga qual documento falta (ex.: RG, comprovante de residência)." };
  if (mensagem.length < 10) return { ok: false, erro: "Escreva o texto da cobrança." };
  if (!(intervalo >= 1 && intervalo <= 30)) return { ok: false, erro: "O intervalo vai de 1 a 30 dias." };
  if (!["auto", "grupo", "numero"].includes(c.destino)) return { ok: false, erro: "Escolha por onde vai a mensagem." };

  const d = await db();
  const { data: at } = await d.from("activities").select("id, client_id").eq("id", c.activityId).maybeSingle();
  if (!at) return { ok: false, erro: "Atividade não encontrada." };
  let clienteId = (at.client_id as string | null) || null;
  // vincular a atividade ao cliente (quando ela ainda não tem)
  if (!clienteId) {
    if (!c.clienteId || !UUID.test(c.clienteId)) return { ok: false, erro: "Vincule a atividade a um cliente." };
    const { error } = await d.from("activities").update({ client_id: c.clienteId }).eq("id", c.activityId);
    if (error) return { ok: false, erro: "Não foi possível vincular o cliente." };
    clienteId = c.clienteId;
  }
  if (!(await destinoDaCobranca(clienteId, c.destino))) {
    return { ok: false, erro: c.destino === "grupo" ? "Este cliente não tem grupo de WhatsApp vinculado. Escolha o número ou o automático." : "Este cliente não tem WhatsApp vinculado (grupo, contato ou número na ficha)." };
  }
  const { data: atual } = await adm().from("cobrancas_documentos").select("id, ativa").eq("activity_id", c.activityId).maybeSingle();
  const campos = { client_id: clienteId, documentos, mensagem, destino: c.destino, intervalo_dias: intervalo, updated_at: new Date().toISOString() };
  const { error } = atual
    ? await d.from("cobrancas_documentos").update(campos).eq("id", atual.id)
    : // a 1ª cobrança sai no próximo horário de cobrar (o cron confere de hora em hora)
      await d.from("cobrancas_documentos").insert({ ...campos, activity_id: c.activityId, ativa: true, proxima_em: new Date().toISOString(), criado_por: profile.id });
  if (error) return { ok: false, erro: "Não foi possível salvar a cobrança." };
  revalidatePath(`/admin/activities/${c.activityId}`);
  return { ok: true };
}

export async function cobrarAgoraAction(activityId: string): Promise<{ ok: boolean; erro?: string; rotulo?: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const tela = await carregarCobrancaAction(activityId);
  if (!tela?.cobranca) return { ok: false, erro: "Esta atividade não tem cobrança." };
  const r = await enviarCobranca(tela.cobranca, tela.config, { forcar: true, criadoPor: profile.id });
  revalidatePath(`/admin/activities/${activityId}`);
  return r.ok ? { ok: true, rotulo: r.rotulo } : { ok: false, erro: r.motivo };
}

export async function pausarCobrancaAction(activityId: string, ativa: boolean): Promise<{ ok: boolean; erro?: string }> {
  await requireRole(["admin", "advogado"]);
  if (!UUID.test(activityId)) return { ok: false, erro: "Atividade inválida." };
  const agora = new Date().toISOString();
  // retomando: a próxima sai no próximo horário de cobrar (e reabre se tinha sido marcada como recebida)
  const { error } = await (await db())
    .from("cobrancas_documentos")
    .update(ativa ? { ativa: true, proxima_em: agora, recebido_em: null, recebido_por: null, updated_at: agora } : { ativa: false, updated_at: agora })
    .eq("activity_id", activityId);
  if (error) return { ok: false, erro: "Não foi possível mudar a cobrança." };
  revalidatePath(`/admin/activities/${activityId}`);
  return { ok: true };
}

export async function documentoRecebidoAction(activityId: string): Promise<{ ok: boolean; erro?: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  if (!UUID.test(activityId)) return { ok: false, erro: "Atividade inválida." };
  const agora = new Date().toISOString();
  const { error } = await (await db()).from("cobrancas_documentos").update({ ativa: false, recebido_em: agora, recebido_por: profile.id, updated_at: agora }).eq("activity_id", activityId);
  if (error) return { ok: false, erro: "Não foi possível marcar como recebido." };
  revalidatePath(`/admin/activities/${activityId}`);
  return { ok: true };
}

/** Texto da cobrança escrito pela IA (modelo mais barato, entrada enxuta). Mantém {cliente} e {documentos} para servir em todas as cobranças. */
export async function gerarMensagemCobrancaAction(v: { titulo: string; documentos: string[]; pedido?: string }): Promise<{ ok: boolean; erro?: string; mensagem?: string }> {
  await requireRole(["admin", "advogado"]);
  const documentos = v.documentos.map((d) => d.trim()).filter(Boolean).slice(0, 20);
  if (!documentos.length) return { ok: false, erro: "Diga primeiro quais documentos faltam." };
  const r = await generateJson<{ mensagem: string }>({
    model: MODELOS.onboarding, funcao: "cobranca",
    system:
      "Você escreve mensagens de WhatsApp de um escritório de advocacia (MC Advogados) cobrando documentos do cliente. Tom cordial, direto, em português do Brasil, sem juridiquês, 2 a 4 frases, no máximo 1 emoji. " +
      "Use exatamente os marcadores {cliente} (primeiro nome do cliente) e {documentos} (lista do que falta) no texto, sem trocar por nomes. Não invente prazos nem valores.",
    parts: [{ text: `Atividade: ${v.titulo.slice(0, 200)}\nDocumentos que faltam: ${documentos.join("; ")}${v.pedido?.trim() ? `\nPedido de quem está escrevendo: ${v.pedido.trim().slice(0, 300)}` : ""}` }],
    schema: { type: "object", properties: { mensagem: { type: "string" } }, required: ["mensagem"] },
  });
  if (!r.ok) return { ok: false, erro: r.error };
  let mensagem = r.data.mensagem.trim();
  if (!mensagem.includes("{documentos}")) mensagem += " Falta: {documentos}.";
  return { ok: true, mensagem };
}

/** Padrões do escritório (Equipe → Configurações do escritório). Só admin. */
export async function salvarConfigCobrancaAction(c: ConfigCobranca): Promise<{ ok: boolean; erro?: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  if (profile.role !== "admin") return { ok: false, erro: "Só o administrador muda o padrão de cobrança." };
  const mensagem = c.mensagem.trim();
  if (mensagem.length < 10 || mensagem.length > 2000) return { ok: false, erro: "O texto precisa ter entre 10 e 2.000 caracteres." };
  if (!(c.intervaloDias >= 1 && c.intervaloDias <= 30)) return { ok: false, erro: "O intervalo vai de 1 a 30 dias." };
  if (!(c.horaInicio >= 6 && c.horaFim <= 22 && c.horaInicio < c.horaFim)) return { ok: false, erro: "O horário precisa ser entre 6h e 22h, com o início antes do fim." };
  if (!(c.avisarApos >= 1 && c.avisarApos <= 50)) return { ok: false, erro: "O aviso à equipe vai de 1 a 50 cobranças." };
  const { error } = await adm()
    .from("escritorio_config")
    .update({
      cobranca_intervalo_dias: Math.round(c.intervaloDias),
      cobranca_hora_inicio: Math.round(c.horaInicio),
      cobranca_hora_fim: Math.round(c.horaFim),
      cobranca_avisar_apos: Math.round(c.avisarApos),
      cobranca_mensagem: mensagem,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  revalidatePath("/admin/team");
  return { ok: true };
}
