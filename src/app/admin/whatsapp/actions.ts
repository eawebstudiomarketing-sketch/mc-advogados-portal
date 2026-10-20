"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirPermissao } from "@/lib/dal";
import {
  BUCKET_WHATSAPP,
  comFotos,
  comLinksDeMidia,
  criarOrdem,
  lerConversa,
  listarContatos,
  listarConversas,
  statusAgente,
  type WaChat,
  type WaContato,
  type WaMensagem,
} from "@/lib/whatsapp";

// Ações da tela WhatsApp (quem tem a permissão WhatsApp). Toda ação no
// WhatsApp vira uma ORDEM em wa_jobs (com quem pediu: fica registrado) e o
// Agente MC no servidor executa. Não existe apagar conversa/mensagem do
// portal: o espelho é backup permanente (o banco bloqueia apagar mensagem).

const POR_PAGINA = 60;
const PAGINA_CONVERSAS = 300;

async function agenteNoAr(db: Awaited<ReturnType<typeof createClient>>) {
  const agente = await statusAgente(db);
  return !!agente?.ligado;
}
const FORA = "O Agente MC está fora do ar no servidor. Tente de novo em alguns segundos.";

/* ───────── leitura ───────── */

/** Conversas em páginas (as fixadas primeiro), com busca no banco inteiro. */
export async function listarConversasAction(op: { offset?: number; busca?: string; arquivadas?: boolean } = {}): Promise<WaChat[]> {
  await exigirPermissao("whatsapp");
  const db = await createClient();
  return listarConversas(db, { limite: PAGINA_CONVERSAS, offset: op.offset ?? 0, busca: op.busca, arquivadas: !!op.arquivadas });
}

export async function listarContatosAction(): Promise<WaContato[]> {
  await exigirPermissao("whatsapp");
  return listarContatos(await createClient());
}

export async function carregarConversaAction(chatJid: string, antesDe?: string, depoisDe?: string): Promise<WaMensagem[]> {
  await exigirPermissao("whatsapp");
  const db = await createClient();
  return lerConversa(db, chatJid, { limite: POR_PAGINA, antesDe, depoisDe });
}

/** Pula pra uma mensagem (busca, citação): 40 antes e 40 depois dela. */
export async function mensagensEmVoltaAction(chatJid: string, waTimestamp: string): Promise<{ msgs: WaMensagem[]; temNovas: boolean }> {
  await exigirPermissao("whatsapp");
  const db = await createClient();
  const depois = new Date(Date.parse(waTimestamp) + 1).toISOString();
  const [antes, novas] = await Promise.all([
    lerConversa(db, chatJid, { limite: 40, antesDe: depois }),
    lerConversa(db, chatJid, { limite: 40, depoisDe: waTimestamp }),
  ]);
  const ids = new Set(antes.map((m) => m.id));
  return { msgs: [...antes, ...novas.filter((m) => !ids.has(m.id))], temNovas: novas.length >= 40 };
}

/** Busca dentro da conversa (texto e nome de arquivo). */
export async function buscarNaConversaAction(chatJid: string, termo: string): Promise<{ id: string; wa_timestamp: string; texto: string | null; from_me: boolean }[]> {
  await exigirPermissao("whatsapp");
  const t = termo.replace(/[%_,()]/g, " ").trim();
  if (t.length < 2) return [];
  const db = await createClient();
  const { data } = await db
    .from("wa_messages")
    .select("id, wa_timestamp, texto, media_nome, from_me")
    .eq("chat_jid", chatJid)
    .or(`texto.ilike.%${t}%,media_nome.ilike.%${t}%`)
    .order("wa_timestamp", { ascending: false })
    .limit(60);
  return (data ?? []).map((m) => ({ id: m.id, wa_timestamp: m.wa_timestamp, texto: m.texto ?? m.media_nome, from_me: m.from_me }));
}

/** Mensagem que chegou pelo tempo real, pronta pra tela (links da mídia, sem o raw). */
export async function prepararMensagemAction(mensagem: WaMensagem): Promise<WaMensagem> {
  await exigirPermissao("whatsapp");
  const [m] = await comLinksDeMidia([mensagem]);
  return m;
}

/** Link da foto de perfil de uma conversa que mudou pelo tempo real. */
export async function linkFotoAction(fotoUrl: string | null): Promise<string | null> {
  await exigirPermissao("whatsapp");
  return comFotos([{ foto_url: fotoUrl }])[0].foto_url;
}

/** Abre (ou cria) a conversa com um contato da agenda ou um número. */
export async function abrirContatoAction(jid: string, nome: string | null): Promise<WaChat | null> {
  await exigirPermissao("whatsapp");
  if (!/^\d{8,15}@s\.whatsapp\.net$/.test(jid)) return null;
  const db = await createClient();
  const { data: existe } = await db.from("wa_chats").select("*").eq("chat_jid", jid).maybeSingle();
  if (existe) return comFotos([existe])[0];
  const { data } = await db.from("wa_chats").insert({ chat_jid: jid, nome, is_group: false }).select("*").single();
  return data ? comFotos([data])[0] : null;
}

/** Mídias, documentos e links de uma conversa (perfil). */
export async function midiasDaConversaAction(chatJid: string): Promise<WaMensagem[]> {
  await exigirPermissao("whatsapp");
  const db = await createClient();
  const { data } = await db
    .from("wa_messages")
    .select("*")
    .eq("chat_jid", chatJid)
    .in("tipo", ["imagem", "video", "documento", "audio"])
    .not("media_path", "is", null)
    .order("wa_timestamp", { ascending: false })
    .limit(60);
  return comLinksDeMidia(data ?? []);
}

/* ───────── envio ───────── */

export async function enviarMensagemAction(chatJid: string, texto: string, responderA?: string | null): Promise<{ ok: boolean; erro?: string; jobId?: string }> {
  const { profile } = await exigirPermissao("whatsapp");
  const t = texto.trim();
  if (!t) return { ok: false, erro: "Mensagem vazia." };
  const db = await createClient();
  if (!(await agenteNoAr(db))) return { ok: false, erro: FORA };
  const job = await criarOrdem(db, {
    tipo: "enviar_mensagem",
    payload: { para: chatJid, texto: t, quem: "humano", ...(responderA ? { responder_a: responderA } : {}) },
    chat_jid: chatJid,
    criado_por: profile.id,
  });
  return { ok: true, jobId: job.id };
}

/** Link pra o navegador subir o arquivo direto no Storage (sem passar pelo limite da Vercel). */
export async function prepararUploadAction(nome: string): Promise<{ ok: boolean; erro?: string; path?: string; token?: string }> {
  await exigirPermissao("whatsapp");
  const seguro = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(-80) || "arquivo";
  const path = `saida/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID().slice(0, 8)}-${seguro}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET_WHATSAPP).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, erro: "Não foi possível preparar o envio do arquivo." };
  return { ok: true, path: data.path, token: data.token };
}

export async function enviarArquivoAction(
  chatJid: string,
  arq: { path: string; mime: string; nome: string; texto?: string; ptt?: boolean; responderA?: string | null; comoDocumento?: boolean }
): Promise<{ ok: boolean; erro?: string; jobId?: string }> {
  const { profile } = await exigirPermissao("whatsapp");
  if (!arq.path.startsWith("saida/")) return { ok: false, erro: "Arquivo inválido." };
  const db = await createClient();
  if (!(await agenteNoAr(db))) return { ok: false, erro: FORA };
  const job = await criarOrdem(db, {
    tipo: "enviar_arquivo",
    payload: {
      para: chatJid,
      quem: "humano",
      media_path: arq.path,
      mime: arq.mime || "application/octet-stream",
      nome: arq.nome,
      texto: arq.texto?.trim() || "",
      ptt: !!arq.ptt,
      como_documento: !!arq.comoDocumento,
      ...(arq.responderA ? { responder_a: arq.responderA } : {}),
    },
    chat_jid: chatJid,
    criado_por: profile.id,
  });
  return { ok: true, jobId: job.id };
}

/* ───────── ordens (reagir, apagar, editar, grupo, perfil…) ───────── */

const PERMITIDAS = new Set(["reagir", "apagar_para_todos", "editar", "encaminhar", "conversa", "perfil_contato", "grupo_info", "grupo"]);

/**
 * Cria a ordem e devolve o id na hora. Quem quer a resposta acompanha pelo
 * navegador (ordem.ts) — esperar aqui travava as outras ações da tela, porque
 * o Next roda uma ação do servidor por vez. Fica registrado quem pediu.
 */
export async function ordemAction(tipo: string, payload: Record<string, unknown>): Promise<{ ok: boolean; erro?: string; jobId?: string }> {
  const { profile } = await exigirPermissao("whatsapp");
  if (!PERMITIDAS.has(tipo)) return { ok: false, erro: "Ação não permitida." };
  const db = await createClient();
  if (!(await agenteNoAr(db))) return { ok: false, erro: FORA };
  const chat = (payload.chat_jid ?? payload.jid ?? null) as string | null;
  const job = await criarOrdem(db, { tipo, payload, chat_jid: chat, criado_por: profile.id });
  return { ok: true, jobId: job.id };
}

/* ───────── conversa e Agente ───────── */

export async function marcarLidoAction(chatJid: string): Promise<void> {
  const { profile } = await exigirPermissao("whatsapp");
  const db = await createClient();
  await db.from("wa_chats").update({ nao_lidas: 0 }).eq("chat_jid", chatJid);
  // também marca como lida no celular (tiques azuis) — só se o Agente estiver ligado
  if (await agenteNoAr(db)) {
    await criarOrdem(db, { tipo: "marcar_lido", payload: { chat_jid: chatJid }, chat_jid: chatJid, criado_por: profile.id });
  }
}

export async function desligarAgenteAction(): Promise<void> {
  const { profile } = await exigirPermissao("whatsapp");
  const db = await createClient();
  await criarOrdem(db, { tipo: "desligar", payload: {}, criado_por: profile.id });
}

export async function vincularClienteAction(chatJid: string, clientId: string | null): Promise<void> {
  await exigirPermissao("whatsapp");
  const db = await createClient();
  await db.from("wa_chats").update({ client_id: clientId }).eq("chat_jid", chatJid);
}

/**
 * Sair do WhatsApp: o Agente faz logout (some de "Aparelhos conectados" no
 * celular) e apaga a sessão. "Trocar" já gera o QR; "desconectar" fica parado
 * até alguém clicar em "Conectar número". As conversas continuam no portal.
 */
export async function sairDoNumeroAction(gerarQr: boolean): Promise<{ ok: boolean; erro?: string }> {
  const { profile } = await exigirPermissao("whatsapp");
  const db = await createClient();
  if (!(await agenteNoAr(db))) return { ok: false, erro: "O Agente MC está fora do ar no servidor (ele precisa estar ligado pra sair do WhatsApp)." };
  await criarOrdem(db, { tipo: "deslogar", payload: { gerar_qr: gerarQr }, criado_por: profile.id });
  return { ok: true };
}

/** Gera o QR pra conectar um número (só quando pedem). */
export async function gerarQrAction(): Promise<{ ok: boolean; erro?: string }> {
  const { profile } = await exigirPermissao("whatsapp");
  const db = await createClient();
  if (!(await agenteNoAr(db))) return { ok: false, erro: FORA };
  await criarOrdem(db, { tipo: "gerar_qr", payload: {}, criado_por: profile.id });
  return { ok: true };
}

/** Para de mostrar QR (desiste de conectar agora). */
export async function cancelarQrAction(): Promise<{ ok: boolean }> {
  const { profile } = await exigirPermissao("whatsapp");
  const db = await createClient();
  await criarOrdem(db, { tipo: "cancelar_qr", payload: {}, criado_por: profile.id });
  return { ok: true };
}
