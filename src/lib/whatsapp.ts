import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";

// WhatsApp do escritório. A conexão mora no "Agente MC" (projeto
// ~/mc-agente-whatsapp, Baileys) que roda no servidor (VPS) e grava tudo em
// wa_chats/wa_messages. O portal só lê o espelho e cria ORDENS em wa_jobs; o
// Agente executa. Nada sai no WhatsApp sem uma ordem. As mensagens são backup
// permanente (o banco não deixa apagar). Mídia e fotos ficam no disco do VPS
// (caminho "vps:...") e são abertas por link assinado (WA_MIDIA_URL/SEGREDO).

type Db = SupabaseClient<Database>;
// colunas da migration 0025 (ainda fora do types.ts gerado)
export type WaChat = Database["public"]["Tables"]["wa_chats"]["Row"] & {
  foto_atualizada_em?: string | null;
  /** caminho "vps:..." original (foto_url vira o link assinado) */
  foto_caminho?: string | null;
};
export type WaMensagem = Omit<Database["public"]["Tables"]["wa_messages"]["Row"], "raw"> & {
  raw?: Json | null;
  media_url?: string | null;
  media_download_url?: string | null;
  /** mídia ainda na fila do Agente (vai aparecer sozinha) */
  media_pendente?: boolean;
  apagada_em?: string | null;
  editada_em?: string | null;
  texto_original?: string | null;
  media_erro?: string | null;
};
export type WaContato = { jid: string; nome: string | null; nome_perfil: string | null };
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
  { busca, soNaoLidas, limite = 60, offset = 0, arquivadas = false }: { busca?: string; soNaoLidas?: boolean; limite?: number; offset?: number; arquivadas?: boolean } = {}
): Promise<WaChat[]> {
  // o Supabase entrega no máximo 1000 linhas por vez: busca em páginas
  const out: WaChat[] = [];
  for (let de = offset; de < offset + limite; de += 1000) {
    let q = db
      .from("wa_chats")
      .select("*")
      .eq("arquivado", arquivadas)
      .order("fixado", { ascending: false })
      .order("ultima_msg_em", { ascending: false, nullsFirst: false })
      .order("chat_jid")
      .range(de, Math.min(de + 1000, offset + limite) - 1);
    if (soNaoLidas) q = q.gt("nao_lidas", 0);
    const termo = busca?.replace(/[%_,()]/g, " ").trim();
    if (termo) {
      const digitos = termo.replace(/\D/g, "");
      q = digitos.length >= 6 ? q.like("chat_jid", `%${digitos}%`) : q.ilike("nome", `%${termo}%`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return comFotos(out);
}

/* ───────── mídia no VPS: link assinado ───────── */

const PREFIXO_VPS = "vps:";

/** Link do servidor de mídia válido por `segundos` (null se não configurado). */
export function linkVps(caminho: string, { segundos = 3600, baixarComo }: { segundos?: number; baixarComo?: string } = {}): string | null {
  const base = process.env.WA_MIDIA_URL;
  const segredo = process.env.WA_MIDIA_SEGREDO;
  if (!base || !segredo) return null;
  const rel = caminho.startsWith(PREFIXO_VPS) ? caminho.slice(PREFIXO_VPS.length) : caminho;
  // arredonda a validade pra hora cheia: o mesmo link se repete e o navegador usa o cache
  const expira = (Math.floor(Date.now() / 3_600_000) + 1) * 3600 + segundos;
  const assinatura = createHmac("sha256", segredo).update(`${rel}:${expira}`).digest("base64url");
  const url = `${base.replace(/\/$/, "")}/m/${rel.split("/").map(encodeURIComponent).join("/")}?e=${expira}&s=${assinatura}`;
  return baixarComo ? `${url}&n=${encodeURIComponent(baixarComo)}` : url;
}

/** Troca o caminho guardado da foto de perfil por um link que abre. */
export function comFotos<T extends { foto_url: string | null }>(chats: T[]): (T & { foto_caminho?: string | null })[] {
  return chats.map((c) =>
    c.foto_url?.startsWith(PREFIXO_VPS) ? { ...c, foto_caminho: c.foto_url, foto_url: linkVps(c.foto_url, { segundos: 86_400 }) } : c
  );
}

/** Mensagens de uma conversa, da mais antiga pra mais nova (com link da mídia). */
export async function lerConversa(
  db: Db,
  chatJid: string,
  { limite = 60, antesDe, desde, depoisDe }: { limite?: number; antesDe?: string; desde?: string; depoisDe?: string } = {}
): Promise<WaMensagem[]> {
  // "depoisDe": mensagens mais novas que um ponto (depois de pular pra uma mensagem antiga)
  let q = db
    .from("wa_messages")
    .select("*")
    .eq("chat_jid", chatJid)
    .order("wa_timestamp", { ascending: !!depoisDe })
    .limit(limite);
  if (antesDe) q = q.lt("wa_timestamp", antesDe);
  if (desde) q = q.gte("wa_timestamp", desde);
  if (depoisDe) q = q.gt("wa_timestamp", depoisDe);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const msgs = depoisDe ? (data ?? []) : (data ?? []).reverse();
  return comLinksDeMidia(msgs);
}

/**
 * Troca media_path por um link temporário pra tela conseguir mostrar (VPS ou,
 * nas mídias antigas e arquivos enviados pelo portal, o Storage do Supabase).
 * Também tira o `raw` (pesado) e marca o que ainda está na fila de download.
 */
export async function comLinksDeMidia(msgs: WaMensagem[]): Promise<WaMensagem[]> {
  const doSupabase = msgs.map((m) => m.media_path).filter((p): p is string => !!p && !p.startsWith(PREFIXO_VPS));
  const url = new Map<string, string>();
  if (doSupabase.length) {
    const { data } = await createAdminClient().storage.from(BUCKET_WHATSAPP).createSignedUrls(doSupabase, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) url.set(d.path, d.signedUrl);
  }
  return msgs.map(({ raw, ...m }) => {
    const pendente = !m.media_path && !!raw && !m.media_erro;
    if (!m.media_path) return { ...m, media_pendente: pendente };
    if (m.media_path.startsWith(PREFIXO_VPS)) {
      const nome = m.media_nome || m.media_path.split("/").pop() || "arquivo";
      return { ...m, media_url: linkVps(m.media_path), media_download_url: linkVps(m.media_path, { baixarComo: nome }) };
    }
    return { ...m, media_url: url.get(m.media_path) ?? null };
  });
}

/** Contatos da agenda do celular (pra começar conversa nova). */
export async function listarContatos(db: Db): Promise<WaContato[]> {
  const out: WaContato[] = [];
  for (let de = 0; de < 10_000; de += 1000) {
    const { data } = await (db as unknown as SupabaseClient)
      .from("wa_contatos")
      .select("jid, nome, nome_perfil")
      .order("nome", { ascending: true, nullsFirst: false })
      .order("jid")
      .range(de, de + 999);
    out.push(...((data as WaContato[] | null) ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
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
