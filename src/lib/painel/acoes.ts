import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/gemini";
import { MODELOS } from "@/lib/ia-modelos";
import { criarAvisos } from "@/lib/avisos";
import { reagendarLembretes } from "@/lib/zap/lembretes";
import { reenviarLink } from "@/lib/atas/assinatura";
import { equipeNoZap } from "./equipe-zap";

// Ações do gerente, executadas SÓ depois da confirmação na tela (com os
// campos que a pessoa editou). Escrevem com o perfil de quem confirmou.

const db = () => createAdminClient() as unknown as SupabaseClient;

/** Mensagem no WhatsApp como envio humano (conta como resposta da pessoa). */
async function mandarZap(para: string, texto: string, perfilId: string) {
  const jid = para.includes("@") ? para : null;
  const { error } = await db()
    .from("wa_jobs")
    .insert({ tipo: "enviar_mensagem", payload: { para, texto, quem: "humano" }, chat_jid: jid, criado_por: perfilId, origem_ref: `painel:${Date.now()}` });
  if (error) throw new Error("Não foi possível colocar a mensagem na fila do WhatsApp.");
}

export async function marcarReuniao(
  a: { clienteId: string; titulo: string; inicio: string; duracaoMin: number; responsavelId: string | null; mensagem: string; destino: string | null; enviar: boolean },
  perfilId: string,
  cliente: SupabaseClient
) {
  if (Number.isNaN(Date.parse(a.inicio))) throw new Error("Data/hora inválida.");
  const fim = new Date(Date.parse(a.inicio) + Math.max(15, a.duracaoMin) * 60_000).toISOString();
  const { data, error } = await cliente
    .from("compromissos")
    .insert({ titulo: a.titulo, tipo: "reuniao", inicio: a.inicio, fim, client_id: a.clienteId, participantes: a.responsavelId ? [a.responsavelId] : [], lembrar_cliente: true, criado_por: perfilId })
    .select("id")
    .single();
  if (error || !data) throw new Error("Não foi possível criar a reunião na Agenda.");
  await reagendarLembretes({ id: data.id, titulo: a.titulo, inicio: a.inicio, local: null, client_id: a.clienteId, lembrar_cliente: true }, perfilId).catch(() => undefined);
  if (a.responsavelId) {
    const { data: r } = await db().from("responsaveis").select("profile_id").eq("id", a.responsavelId).maybeSingle();
    if (r?.profile_id && r.profile_id !== perfilId)
      await criarAvisos([{ profile_id: r.profile_id, tipo: "compromisso", titulo: `Você está em: ${a.titulo}`, corpo: new Date(a.inicio).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }), url: `/admin/agenda/compromisso/${data.id}` }]);
  }
  if (a.enviar && a.destino && a.mensagem.trim()) await mandarZap(a.destino, a.mensagem.trim(), perfilId);
  return `Reunião criada na Agenda${a.enviar && a.destino ? " e mensagem enviada ao cliente" : ""}.`;
}

export async function enviarResposta(a: { chatJid: string; texto: string }, perfilId: string) {
  if (!a.texto.trim()) throw new Error("Mensagem vazia.");
  await mandarZap(a.chatJid, a.texto.trim(), perfilId);
  return "Mensagem na fila do WhatsApp.";
}

export async function alertar(a: { pessoas: { profileId: string; telefone: string | null }[]; titulo: string; corpo: string; url: string; zap: boolean }, perfilId: string) {
  if (!a.pessoas.length) throw new Error("Ninguém para alertar.");
  await criarAvisos(a.pessoas.map((p) => ({ profile_id: p.profileId, tipo: "gerente", titulo: a.titulo, corpo: a.corpo, url: a.url })));
  let zap = 0;
  if (a.zap)
    for (const p of a.pessoas) {
      const tel = String(p.telefone ?? "").replace(/\D/g, "");
      if (tel.length < 10) continue;
      await mandarZap(tel, `*${a.titulo}*\n${a.corpo}\n\nmcadvogados.app.br${a.url}`, perfilId);
      zap++;
    }
  return `Aviso no portal para ${a.pessoas.length} pessoa(s)${a.zap ? ` e WhatsApp para ${zap}` : ""}.`;
}

export async function concluir(a: { activityId: string }, cliente: SupabaseClient) {
  const { error } = await cliente.from("activities").update({ status: "concluida", concluida_em: new Date().toISOString() }).eq("id", a.activityId);
  if (error) throw new Error("Não foi possível concluir a atividade.");
  return "Atividade concluída.";
}

export async function moverPrazos(a: { ids: string[]; novaData: string }, cliente: SupabaseClient) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.novaData)) throw new Error("Data inválida.");
  if (!a.ids.length) throw new Error("Marque pelo menos uma atividade.");
  const { error } = await cliente.from("activities").update({ deadline: a.novaData }).in("id", a.ids);
  if (error) throw new Error("Não foi possível mudar as datas.");
  return `${a.ids.length} atividade(s) passada(s) para ${a.novaData.split("-").reverse().join("/")}.`;
}

export async function lembrarAssinaturas(a: { ids: string[] }) {
  let ok = 0;
  for (const id of a.ids) {
    await reenviarLink(id).then(() => ok++).catch(() => undefined);
  }
  if (!ok) throw new Error("Não foi possível reenviar os links.");
  return `Link reenviado para ${ok} pessoa(s).`;
}

/** Rascunho de resposta ao cliente (IA barata, só quando clicam em "responder"). */
export async function rascunhoResposta(chatJid: string): Promise<string> {
  const [{ data: msgs }, membro, { data: chat }] = await Promise.all([
    db().from("wa_messages").select("from_me, sender_jid, texto, wa_timestamp").eq("chat_jid", chatJid).not("texto", "is", null).order("wa_timestamp", { ascending: false }).limit(14),
    equipeNoZap(),
    db().from("wa_chats").select("nome, client_id, is_group").eq("chat_jid", chatJid).maybeSingle(),
  ]);
  const conversa = ((msgs ?? []) as { from_me: boolean; sender_jid: string | null; texto: string }[])
    .reverse()
    .map((m) => `${m.from_me || membro(m.sender_jid) ? "Escritório" : "Cliente"}: ${String(m.texto).replace(/\s+/g, " ").slice(0, 300)}`)
    .join("\n");
  let contexto = "";
  if (chat?.client_id) {
    const { data: ats } = await db().from("activities").select("title, status, deadline").eq("client_id", chat.client_id).in("status", ["aberta", "em_andamento"]).limit(8);
    contexto = ((ats ?? []) as { title: string; deadline: string | null }[]).map((a) => `- ${a.title}${a.deadline ? ` (prazo ${a.deadline.split("-").reverse().join("/")})` : ""}`).join("\n");
  }
  const r = await generateJson<{ mensagem: string }>({
    model: MODELOS.assistente,
    system:
      "Você escreve, em nome do escritório MC Advogados, a próxima mensagem de WhatsApp para o cliente. Português do Brasil, cordial e curta (até 4 linhas), responde o que o cliente perguntou por último. Se não houver informação suficiente para responder o mérito, diga que a equipe está verificando e dá retorno até um prazo curto. Não invente fatos, valores nem datas de processo. Sem assinatura.",
    parts: [{ text: `Conversa (${chat?.is_group ? "grupo" : "privado"} ${chat?.nome ?? ""}):\n${conversa || "(sem mensagens recentes)"}\n\nAtividades abertas do cliente:\n${contexto || "(nenhuma)"}` }],
    schema: { type: "object", properties: { mensagem: { type: "string" } }, required: ["mensagem"] },
  });
  if (!r.ok) throw new Error(r.error);
  return r.data.mensagem.trim();
}
