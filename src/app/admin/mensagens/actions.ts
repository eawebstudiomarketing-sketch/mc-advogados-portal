"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { enviarPush } from "@/lib/push";
import { contarNaoLidas, GERAL, lerMensagens, listarEquipe, outroDaConversa, type ChatMensagem } from "@/lib/data/mensagens";

// Mensagens internas da equipe e avisos. Quem pode ler/escrever em cada
// conversa é decidido pelo banco (função participa_conversa).

export async function carregarMensagensAction(conversa: string, antesDe?: string): Promise<ChatMensagem[]> {
  await requireRole(["admin", "advogado"]);
  return lerMensagens(conversa, antesDe);
}

export async function enviarMensagemInternaAction(conversa: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const limpo = texto.trim().slice(0, 5000);
  if (!limpo) return { ok: false, error: "Mensagem vazia." };
  const db = await createClient();
  const { error } = await db.from("chat_mensagens").insert({ conversa, autor_id: profile.id, texto: limpo });
  if (error) return { ok: false, error: "Não foi possível enviar." };
  await db.from("chat_leituras").upsert({ profile_id: profile.id, conversa, lido_em: new Date().toISOString() });

  // aviso no celular de quem recebe (o canal geral avisa todo mundo)
  const destino = conversa === GERAL ? (await listarEquipe(profile.id)).map((p) => p.id) : [outroDaConversa(conversa, profile.id)].filter((x): x is string => !!x);
  const nome = profile.full_name.split(" ")[0];
  await enviarPush(destino, {
    titulo: conversa === GERAL ? `${nome} no canal Escritório` : `Mensagem de ${nome}`,
    corpo: limpo.length > 140 ? `${limpo.slice(0, 137)}…` : limpo,
    url: `/admin/mensagens?c=${encodeURIComponent(conversa)}`,
    tag: `chat-${conversa}`,
  }).catch(() => 0);
  return { ok: true };
}

export async function marcarConversaLidaAction(conversa: string): Promise<void> {
  const profile = await requireRole(["admin", "advogado"]);
  const db = await createClient();
  await db.from("chat_leituras").upsert({ profile_id: profile.id, conversa, lido_em: new Date().toISOString() });
}

export async function marcarAvisosLidosAction(ids?: string[]): Promise<void> {
  const profile = await requireRole(["admin", "advogado"]);
  const db = await createClient();
  let q = db.from("avisos").update({ lido_em: new Date().toISOString() }).eq("profile_id", profile.id).is("lido_em", null);
  if (ids?.length) q = q.in("id", ids);
  await q;
}

export async function contarNaoLidasAction(): Promise<number> {
  const profile = await requireRole(["admin", "advogado"]);
  return contarNaoLidas(profile.id).catch(() => 0);
}
