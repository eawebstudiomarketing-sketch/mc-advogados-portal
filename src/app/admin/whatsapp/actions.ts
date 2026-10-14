"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUCKET_WHATSAPP, comLinksDeMidia, criarOrdem, lerConversa, statusAgente, type WaMensagem } from "@/lib/whatsapp";

// Ações da tela WhatsApp (só admin). Enviar = criar ordem; quem manda de fato
// é o Agente MC na máquina do operador.

export async function carregarConversaAction(chatJid: string, antesDe?: string): Promise<WaMensagem[]> {
  await requireRole(["admin"]);
  const db = await createClient();
  return lerConversa(db, chatJid, { limite: 60, antesDe });
}

/** Link temporário da mídia de uma mensagem que chegou pelo tempo real. */
export async function linkMidiaAction(mensagem: WaMensagem): Promise<string | null> {
  await requireRole(["admin"]);
  const [m] = await comLinksDeMidia([mensagem]);
  return m.media_url ?? null;
}

export async function enviarMensagemAction(chatJid: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  const profile = await requireRole(["admin"]);
  const t = texto.trim();
  if (!t) return { ok: false, erro: "Mensagem vazia." };
  const db = await createClient();
  const agente = await statusAgente(db);
  if (!agente?.ligado) return { ok: false, erro: "O Agente MC está desligado. Ligue no computador pra enviar." };
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
 * até alguém clicar em "Conectar número". Com `limpar`, apaga as conversas.
 */
export async function sairDoNumeroAction(gerarQr: boolean, limpar: boolean): Promise<{ ok: boolean; erro?: string }> {
  const profile = await requireRole(["admin"]);
  const db = await createClient();
  const agente = await statusAgente(db);
  if (!agente?.ligado) return { ok: false, erro: "Ligue o Agente MC no computador primeiro (ele precisa estar ligado pra sair do WhatsApp)." };
  if (limpar) await limparConversas();
  await criarOrdem(db, { tipo: "deslogar", payload: { gerar_qr: gerarQr }, criado_por: profile.id });
  return { ok: true };
}

/** Gera o QR pra conectar um número (só quando pedem). */
export async function gerarQrAction(): Promise<{ ok: boolean; erro?: string }> {
  const profile = await requireRole(["admin"]);
  const db = await createClient();
  const agente = await statusAgente(db);
  if (!agente?.ligado) return { ok: false, erro: "Ligue o Agente MC no computador primeiro." };
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

/** Apaga o espelho (mensagens, conversas, ordens e mídias). Não mexe no celular. */
export async function limparConversasAction(): Promise<{ ok: boolean }> {
  await requireRole(["admin"]);
  await limparConversas();
  return { ok: true };
}

async function limparConversas() {
  const adm = createAdminClient();
  await adm.from("leads").update({ chat_jid: null }).not("chat_jid", "is", null);
  await adm.from("wa_messages").delete().not("id", "is", null);
  await adm.from("wa_chats").delete().not("chat_jid", "is", null);
  await adm.from("wa_jobs").delete().in("status", ["concluido", "erro", "cancelado"]);
  // mídias: uma pasta por conversa (+ "saida")
  const bucket = adm.storage.from(BUCKET_WHATSAPP);
  const { data: pastas } = await bucket.list("", { limit: 1000 });
  for (const p of pastas ?? []) {
    if (p.id) {
      await bucket.remove([p.name]);
      continue;
    }
    const sub = await listarTudo(bucket, p.name);
    for (let i = 0; i < sub.length; i += 500) await bucket.remove(sub.slice(i, i + 500));
  }
}

async function listarTudo(bucket: ReturnType<ReturnType<typeof createAdminClient>["storage"]["from"]>, prefixo: string): Promise<string[]> {
  const { data } = await bucket.list(prefixo, { limit: 1000 });
  const out: string[] = [];
  for (const f of data ?? []) {
    const caminho = `${prefixo}/${f.name}`;
    if (f.id) out.push(caminho);
    else out.push(...(await listarTudo(bucket, caminho)));
  }
  return out;
}
