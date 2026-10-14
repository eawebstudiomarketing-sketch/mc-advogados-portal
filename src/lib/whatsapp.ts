import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";

// WhatsApp do escritório. A conexão mora no "Agente MC" (projeto
// ~/mc-agente-whatsapp, Baileys) que roda na máquina do operador e grava
// tudo em wa_chats/wa_messages. O portal só lê o espelho e cria ORDENS em
// wa_jobs; o Agente executa. Nada sai no WhatsApp sem uma ordem.

type Db = SupabaseClient<Database>;
export type WaChat = Database["public"]["Tables"]["wa_chats"]["Row"];
export type WaMensagem = Database["public"]["Tables"]["wa_messages"]["Row"] & { media_url?: string | null };
export type WaJob = Database["public"]["Tables"]["wa_jobs"]["Row"];
export type WaAgente = Database["public"]["Tables"]["wa_agent"]["Row"] & { ligado: boolean };

export const BUCKET_WHATSAPP = "whatsapp";
/** Sem batimento há mais que isso = Agente desligado. */
export const HEARTBEAT_LIMITE_MS = 35_000;

export function agenteLigado(a: Pick<WaAgente, "online" | "last_heartbeat"> | null): boolean {
  if (!a?.online || !a.last_heartbeat) return false;
  return Date.now() - new Date(a.last_heartbeat).getTime() < HEARTBEAT_LIMITE_MS;
}

/** Status do Agente (a máquina mais recente que deu sinal). */
export async function statusAgente(db: Db): Promise<WaAgente | null> {
  const { data } = await db.from("wa_agent").select("*").order("last_heartbeat", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  return data ? { ...data, ligado: agenteLigado(data) } : null;
}

export async function listarConversas(
  db: Db,
  { busca, soNaoLidas, limite = 60 }: { busca?: string; soNaoLidas?: boolean; limite?: number } = {}
): Promise<WaChat[]> {
  let q = db.from("wa_chats").select("*").eq("arquivado", false).order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(limite);
  if (soNaoLidas) q = q.gt("nao_lidas", 0);
  const termo = busca?.replace(/[%_,()]/g, " ").trim();
  if (termo) {
    const digitos = termo.replace(/\D/g, "");
    q = digitos.length >= 6 ? q.like("chat_jid", `%${digitos}%`) : q.ilike("nome", `%${termo}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Mensagens de uma conversa, da mais antiga pra mais nova (com link da mídia). */
export async function lerConversa(
  db: Db,
  chatJid: string,
  { limite = 60, antesDe, desde }: { limite?: number; antesDe?: string; desde?: string } = {}
): Promise<WaMensagem[]> {
  let q = db.from("wa_messages").select("*").eq("chat_jid", chatJid).order("wa_timestamp", { ascending: false }).limit(limite);
  if (antesDe) q = q.lt("wa_timestamp", antesDe);
  if (desde) q = q.gte("wa_timestamp", desde);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const msgs = (data ?? []).reverse();
  return comLinksDeMidia(msgs);
}

/** Troca media_path por um link temporário (1h) pra tela conseguir mostrar. */
export async function comLinksDeMidia(msgs: WaMensagem[]): Promise<WaMensagem[]> {
  const paths = msgs.map((m) => m.media_path).filter((p): p is string => !!p);
  if (!paths.length) return msgs;
  const { data } = await createAdminClient().storage.from(BUCKET_WHATSAPP).createSignedUrls(paths, 3600);
  const url = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return msgs.map((m) => (m.media_path ? { ...m, media_url: url.get(m.media_path) ?? null } : m));
}

/**
 * Acha a conversa de um destino: chat_jid, telefone, nome do contato no zap
 * ou nome do cliente cadastrado (via wa_chats.client_id). Telefone sem
 * conversa ainda é aceito — o Agente confere no WhatsApp na hora de enviar.
 */
export async function resolverDestino(
  db: Db,
  alvo: string
): Promise<{ para: string; chat: WaChat | null; opcoes?: WaChat[] }> {
  const a = alvo.trim();
  if (!a) throw new Error("Diga pra quem é a mensagem.");
  if (a.includes("@")) {
    const { data } = await db.from("wa_chats").select("*").eq("chat_jid", a).maybeSingle();
    return { para: a, chat: data };
  }
  const digitos = a.replace(/\D/g, "");
  if (digitos.length >= 10) {
    const { data } = await db.from("wa_chats").select("*").like("chat_jid", `%${digitos.slice(-8)}%`).eq("is_group", false).limit(1);
    return { para: data?.[0]?.chat_jid ?? digitos, chat: data?.[0] ?? null };
  }
  const termo = a.replace(/[%_,()]/g, " ");
  const { data: porNome } = await db.from("wa_chats").select("*").ilike("nome", `%${termo}%`).order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(5);
  const { data: clientes } = await db.from("clients").select("id").ilike("name", `%${termo}%`).limit(5);
  let porCliente: WaChat[] = [];
  if (clientes?.length) {
    const r = await db.from("wa_chats").select("*").in("client_id", clientes.map((c) => c.id));
    porCliente = r.data ?? [];
  }
  const todos = [...porCliente, ...(porNome ?? []).filter((c) => !porCliente.some((p) => p.chat_jid === c.chat_jid))];
  if (!todos.length) throw new Error(`Não achei conversa de "${alvo}" no WhatsApp. Informe o telefone com DDD.`);
  if (todos.length > 1 && !porCliente.length) {
    const exato = todos.find((c) => c.nome?.toLowerCase() === termo.toLowerCase());
    if (!exato) return { para: todos[0].chat_jid, chat: todos[0], opcoes: todos };
    return { para: exato.chat_jid, chat: exato };
  }
  return { para: todos[0].chat_jid, chat: todos[0] };
}

/** Cria uma ordem pro Agente executar. */
export async function criarOrdem(
  db: Db,
  ordem: { tipo: string; payload: Record<string, unknown>; chat_jid?: string | null; criado_por?: string | null; agendado_para?: string | null }
): Promise<WaJob> {
  const { data, error } = await db
    .from("wa_jobs")
    .insert({
      tipo: ordem.tipo,
      payload: ordem.payload as Json,
      chat_jid: ordem.chat_jid ?? null,
      criado_por: ordem.criado_por ?? null,
      agendado_para: ordem.agendado_para ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Sobe um arquivo de saída (ex.: PDF do relatório) pro bucket e devolve o caminho. */
export async function subirArquivoDeSaida(nome: string, bytes: Uint8Array | Buffer, mime: string): Promise<string> {
  const seguro = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_");
  const path = `saida/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID().slice(0, 8)}-${seguro}`;
  const { error } = await createAdminClient().storage.from(BUCKET_WHATSAPP).upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`Não consegui guardar o arquivo: ${error.message}`);
  return path;
}

export const telefoneDoJid = (jid: string) => {
  const d = jid.split("@")[0];
  if (jid.endsWith("@g.us")) return "grupo";
  if (jid.endsWith("@lid")) return "número oculto";
  if (d.length === 13 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d;
};
