import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { comLinksDeMidia, type WaMensagem } from "@/lib/whatsapp";
import type { AudioZap } from "@/lib/transcricao-formato";

export { tituloDoAudio, type AudioZap } from "@/lib/transcricao-formato";

// Áudios (e vídeos) do WhatsApp do portal que podem virar transcrição: a aba
// Transcrição escolhe um da lista, o menu da mensagem no zap manda direto
// (/admin/transcricao?wa=<id>) e o Assistente usa as mesmas funções.

type Db = SupabaseClient<Database>;

/** áudio/vídeo de verdade, ou arquivo de áudio/vídeo mandado como documento */
const FILTRO_MIDIA = "tipo.in.(audio,video),media_mime.like.audio/*,media_mime.like.video/*";

function paraItem(m: WaMensagem, nomes: Map<string, string>): AudioZap {
  const conversa = nomes.get(m.chat_jid) ?? m.chat_jid.split("@")[0];
  const video = m.tipo === "video" || !!m.media_mime?.startsWith("video/");
  return {
    id: m.id,
    chat_jid: m.chat_jid,
    conversa,
    de: m.from_me ? "Escritório" : m.sender_nome || conversa,
    from_me: m.from_me,
    tipo: video ? "video" : "audio",
    quando: m.wa_timestamp,
    url: m.media_url ?? null,
    nome: m.media_nome,
  };
}

async function nomesDasConversas(db: Db, jids: string[]): Promise<Map<string, string>> {
  if (!jids.length) return new Map();
  const { data } = await db.from("wa_chats").select("chat_jid, nome").in("chat_jid", jids);
  return new Map((data ?? []).filter((c) => c.nome).map((c) => [c.chat_jid, c.nome!]));
}

/** Os mais recentes primeiro; `busca` = nome da conversa ou telefone. */
export async function listarAudiosDoWhatsapp(
  db: Db,
  { busca, chatJid, antesDe, limite = 30 }: { busca?: string; chatJid?: string; antesDe?: string; limite?: number } = {}
): Promise<AudioZap[]> {
  let jids: string[] | null = chatJid ? [chatJid] : null;
  const termo = busca?.replace(/[%_,()]/g, " ").trim();
  if (!jids && termo) {
    const digitos = termo.replace(/\D/g, "");
    const q = db.from("wa_chats").select("chat_jid").limit(50);
    const { data } = await (digitos.length >= 6 ? q.like("chat_jid", `%${digitos}%`) : q.ilike("nome", `%${termo}%`));
    jids = (data ?? []).map((c) => c.chat_jid);
    if (!jids.length) return [];
  }
  let q = db
    .from("wa_messages")
    .select("*")
    .not("media_path", "is", null)
    .or(FILTRO_MIDIA)
    .order("wa_timestamp", { ascending: false })
    .limit(Math.min(limite, 60));
  if (jids) q = q.in("chat_jid", jids);
  if (antesDe) q = q.lt("wa_timestamp", antesDe);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const msgs = await comLinksDeMidia((data ?? []) as WaMensagem[]);
  const nomes = await nomesDasConversas(db, [...new Set(msgs.map((m) => m.chat_jid))]);
  return msgs.map((m) => paraItem(m, nomes));
}

/** Um áudio pelo id da mensagem, com o caminho da mídia (só no servidor). */
export async function audioDoWhatsapp(db: Db, msgId: string): Promise<{ audio: AudioZap; media_path: string; media_mime: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(msgId)) return null;
  const { data } = await db.from("wa_messages").select("*").eq("id", msgId).not("media_path", "is", null).or(FILTRO_MIDIA).maybeSingle();
  if (!data) return null;
  const [m] = await comLinksDeMidia([data as WaMensagem]);
  return { audio: paraItem(m, await nomesDasConversas(db, [m.chat_jid])), media_path: data.media_path!, media_mime: data.media_mime };
}

