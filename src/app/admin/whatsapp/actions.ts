"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { comFotos, comLinksDeMidia, criarOrdem, lerConversa, statusAgente, type WaChat, type WaMensagem } from "@/lib/whatsapp";

// Ações da tela WhatsApp (só admin). Enviar = criar ordem; quem manda de fato
// é o Agente MC no servidor. Não existe ação de apagar conversa: o espelho é
// backup permanente (o banco bloqueia apagar mensagem).

export async function carregarConversaAction(chatJid: string, antesDe?: string): Promise<WaMensagem[]> {
  await requireRole(["admin"]);
  const db = await createClient();
  return lerConversa(db, chatJid, { limite: 60, antesDe });
}

/** Mensagem que chegou pelo tempo real, pronta pra tela (links da mídia, sem o raw). */
export async function prepararMensagemAction(mensagem: WaMensagem): Promise<WaMensagem> {
  await requireRole(["admin"]);
  const [m] = await comLinksDeMidia([mensagem]);
  return m;
}

/** Link da foto de perfil de uma conversa que mudou pelo tempo real. */
export async function linkFotoAction(fotoUrl: string | null): Promise<string | null> {
  await requireRole(["admin"]);
  return comFotos([{ foto_url: fotoUrl }])[0].foto_url;
}

/** Abre (ou cria) a conversa com um contato da agenda. */
export async function abrirContatoAction(jid: string, nome: string | null): Promise<WaChat | null> {
  await requireRole(["admin"]);
  if (!/^\d{8,15}@s\.whatsapp\.net$/.test(jid)) return null;
  const db = await createClient();
  const { data: existe } = await db.from("wa_chats").select("*").eq("chat_jid", jid).maybeSingle();
  if (existe) return comFotos([existe])[0];
  const { data } = await db.from("wa_chats").insert({ chat_jid: jid, nome, is_group: false }).select("*").single();
  return data ? comFotos([data])[0] : null;
}

export async function enviarMensagemAction(chatJid: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  const profile = await requireRole(["admin"]);
  const t = texto.trim();
  if (!t) return { ok: false, erro: "Mensagem vazia." };
  const db = await createClient();
  const agente = await statusAgente(db);
  if (!agente?.ligado) return { ok: false, erro: "O Agente MC está fora do ar no servidor. Tente de novo em alguns segundos." };
  await criarOrdem(db, { tipo: "enviar_mensagem", payload: { para: chatJid, texto: t, quem: "humano" }, chat_jid: chatJid, criado_por: profile.id });
  return { ok: true };
}

export async function marcarLidoAction(chatJid: string): Promise<void> {
  const profile = await requireRole(["admin"]);
  const db = await createClient();
  await db.from("wa_chats").update({ nao_lidas: 0 }).eq("chat_jid", chatJid);
  // também marca como lida no celular (tiques azuis) — só se o Agente estiver ligado
  const agente = await statusAgente(db);
  if (agente?.ligado) {
    await criarOrdem(db, { tipo: "marcar_lido", payload: { chat_jid: chatJid }, chat_jid: chatJid, criado_por: profile.id });
  }
}

export async function desligarAgenteAction(): Promise<void> {
  const profile = await requireRole(["admin"]);
  const db = await createClient();
  await criarOrdem(db, { tipo: "desligar", payload: {}, criado_por: profile.id });
}

export async function vincularClienteAction(chatJid: string, clientId: string | null): Promise<void> {
  await requireRole(["admin"]);
  const db = await createClient();
  await db.from("wa_chats").update({ client_id: clientId }).eq("chat_jid", chatJid);
}

/**
 * Sair do WhatsApp: o Agente faz logout (some de "Aparelhos conectados" no
 * celular) e apaga a sessão. "Trocar" já gera o QR; "desconectar" fica parado
 * até alguém clicar em "Conectar número". As conversas continuam no portal.
 */
export async function sairDoNumeroAction(gerarQr: boolean): Promise<{ ok: boolean; erro?: string }> {
  const profile = await requireRole(["admin"]);
  const db = await createClient();
  const agente = await statusAgente(db);
  if (!agente?.ligado) return { ok: false, erro: "O Agente MC está fora do ar no servidor (ele precisa estar ligado pra sair do WhatsApp)." };
  await criarOrdem(db, { tipo: "deslogar", payload: { gerar_qr: gerarQr }, criado_por: profile.id });
  return { ok: true };
}

/** Gera o QR pra conectar um número (só quando pedem). */
export async function gerarQrAction(): Promise<{ ok: boolean; erro?: string }> {
  const profile = await requireRole(["admin"]);
  const db = await createClient();
  const agente = await statusAgente(db);
  if (!agente?.ligado) return { ok: false, erro: "O Agente MC está fora do ar no servidor. Tente de novo em alguns segundos." };
  await criarOrdem(db, { tipo: "gerar_qr", payload: {}, criado_por: profile.id });
  return { ok: true };
}

/** Para de mostrar QR (desiste de conectar agora). */
export async function cancelarQrAction(): Promise<{ ok: boolean }> {
  const profile = await requireRole(["admin"]);
  const db = await createClient();
  await criarOrdem(db, { tipo: "cancelar_qr", payload: {}, criado_por: profile.id });
  return { ok: true };
}
