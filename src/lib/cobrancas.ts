import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinoDoCliente, enfileirarMensagem } from "@/lib/zap/fila";
import { criarAvisos } from "@/lib/avisos";
import { idsDosAdmins } from "@/lib/push";

// Cobrança de documento (03/11/2026): atividade que depende de documento do
// cliente cobra no WhatsApp de tempos em tempos até o documento chegar. O
// intervalo, o horário e o texto padrão ficam em escritorio_config (o Maurício
// edita em Equipe → Configurações do escritório); cada cobrança pode ter o seu.
// O cron de hora em hora (GitHub Actions → /api/cron/cobrancas) só manda em dia
// útil, dentro do horário, e para sozinho quando todos os documentos chegam
// (enviados pelo portal com o nome do item) ou quando a atividade é concluída.

export type ConfigCobranca = { intervaloDias: number; horaInicio: number; horaFim: number; avisarApos: number; mensagem: string };
export type Cobranca = {
  id: string;
  activity_id: string;
  client_id: string;
  documentos: string[];
  mensagem: string;
  destino: "auto" | "grupo" | "numero";
  intervalo_dias: number;
  ativa: boolean;
  proxima_em: string;
  ultima_em: string | null;
  envios: number;
  equipe_avisada_em: string | null;
  recebido_em: string | null;
  created_at: string;
};

export const MENSAGEM_PADRAO =
  'Olá, {cliente}! Tudo bem? Aqui é da MC Advogados. Para darmos andamento em "{titulo}", ainda precisamos de: {documentos}. Pode nos enviar por aqui mesmo, por favor? Obrigado!';

// tabelas/colunas da migration 0065 (fora do types.ts gerado)
const db = () => createAdminClient() as unknown as SupabaseClient;

export async function configCobranca(): Promise<ConfigCobranca> {
  const { data } = await db()
    .from("escritorio_config")
    .select("cobranca_intervalo_dias, cobranca_hora_inicio, cobranca_hora_fim, cobranca_avisar_apos, cobranca_mensagem")
    .eq("id", 1)
    .maybeSingle();
  return {
    intervaloDias: data?.cobranca_intervalo_dias ?? 2,
    horaInicio: data?.cobranca_hora_inicio ?? 9,
    horaFim: data?.cobranca_hora_fim ?? 17,
    avisarApos: data?.cobranca_avisar_apos ?? 5,
    mensagem: data?.cobranca_mensagem ?? MENSAGEM_PADRAO,
  };
}

/** "RG, CPF e comprovante de residência" */
export const listaDocumentos = (docs: string[]) => (docs.length <= 1 ? docs.join("") : `${docs.slice(0, -1).join(", ")} e ${docs[docs.length - 1]}`);

export function preencherMensagem(texto: string, v: { cliente: string; titulo: string; documentos: string[] }) {
  const primeiro = v.cliente.trim().split(/\s+/)[0] ?? "";
  return texto.replaceAll("{cliente}", primeiro).replaceAll("{titulo}", v.titulo).replaceAll("{documentos}", listaDocumentos(v.documentos));
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Documentos da cobrança que já chegaram pelo portal (documento do cliente com o nome do item, depois que a cobrança começou). */
export async function documentosRecebidos(c: Pick<Cobranca, "client_id" | "documentos" | "created_at">): Promise<string[]> {
  const { data } = await db().from("documents").select("requested_item").eq("client_id", c.client_id).not("requested_item", "is", null).gte("created_at", c.created_at);
  const chegou = new Set((data ?? []).map((d) => semAcento(String(d.requested_item))));
  return c.documentos.filter((d) => chegou.has(semAcento(d)));
}

/** Para onde vai a cobrança: o grupo do cliente, o número/contato dele, ou o automático (grupo, senão contato, senão número). */
export async function destinoDaCobranca(clientId: string, destino: Cobranca["destino"]): Promise<{ para: string; rotulo: string } | null> {
  if (destino === "auto") return destinoDoCliente(clientId);
  const d = db();
  const [{ data: cliente }, { data: chats }] = await Promise.all([
    d.from("clients").select("whatsapp_numeros").eq("id", clientId).maybeSingle(),
    d.from("wa_chats").select("chat_jid, nome, is_group").eq("client_id", clientId).order("ultima_msg_em", { ascending: false, nullsFirst: false }),
  ]);
  if (destino === "grupo") {
    const g = (chats ?? []).find((c) => c.is_group);
    return g ? { para: g.chat_jid, rotulo: `grupo “${g.nome ?? "do cliente"}”` } : null;
  }
  const contato = (chats ?? []).find((c) => !c.is_group && String(c.chat_jid).endsWith("@s.whatsapp.net"));
  if (contato) return { para: contato.chat_jid, rotulo: `contato ${contato.nome ?? String(contato.chat_jid).split("@")[0]}` };
  const numero = (cliente?.whatsapp_numeros as string[] | null)?.[0];
  return numero ? { para: numero.replace(/\D/g, ""), rotulo: `número ${numero}` } : null;
}

/* ───── calendário: dia útil e horário da Bahia ───── */

const bahia = (d: Date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24, util: !["Sat", "Sun"].includes(p.weekday) };
};
const somaDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ehUtil = (dia: string) => ![0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());

/** Próxima cobrança: `intervalo` dias úteis depois de hoje, no início do horário (Bahia, UTC-3). */
export function proximaCobranca(agora: Date, intervalo: number, horaInicio: number): Date {
  let dia = bahia(agora).dia;
  for (let n = 0; n < intervalo; ) {
    dia = somaDias(dia, 1);
    if (ehUtil(dia)) n++;
  }
  return new Date(`${dia}T${String(horaInicio).padStart(2, "0")}:00:00-03:00`);
}

/** Dentro do horário de cobrar agora? (dia útil, entre o início e o fim). */
export function horarioDeCobrar(agora: Date, cfg: Pick<ConfigCobranca, "horaInicio" | "horaFim">): boolean {
  const b = bahia(agora);
  return b.util && b.hora >= cfg.horaInicio && b.hora < cfg.horaFim;
}

/* ───── envio ───── */

type Contexto = { titulo: string; cliente: string; status: string; responsavelProfile: string | null };

async function contextoDa(c: Cobranca): Promise<Contexto | null> {
  const { data } = await db().from("activities").select("title, status, archived_at, clients(name), responsaveis!activities_responsavel_id_fkey(profile_id)").eq("id", c.activity_id).maybeSingle();
  if (!data) return null;
  return {
    titulo: data.title as string,
    cliente: (data.clients as unknown as { name: string } | null)?.name ?? "",
    status: data.archived_at ? "arquivada" : (data.status as string),
    responsavelProfile: (data.responsaveis as unknown as { profile_id: string | null } | null)?.profile_id ?? null,
  };
}

export type ResultadoEnvio = { ok: true; rotulo: string; faltam: string[] } | { ok: false; motivo: string; encerrada?: boolean };

/**
 * Manda (ou agenda para já) uma cobrança: confere o que já chegou, cobra só o
 * que falta, conta o envio e marca a próxima. `forcar` = botão "Cobrar agora".
 */
export async function enviarCobranca(c: Cobranca, cfg: ConfigCobranca, { forcar = false, criadoPor = null as string | null } = {}): Promise<ResultadoEnvio> {
  const ctx = await contextoDa(c);
  if (!ctx) return { ok: false, motivo: "Atividade não encontrada." };
  const agora = new Date();
  if (ctx.status === "concluida" || ctx.status === "cancelada" || ctx.status === "arquivada") {
    await db().from("cobrancas_documentos").update({ ativa: false, updated_at: agora.toISOString() }).eq("id", c.id);
    return { ok: false, motivo: "A atividade já foi encerrada; a cobrança parou.", encerrada: true };
  }
  const recebidos = await documentosRecebidos(c);
  const faltam = c.documentos.filter((d) => !recebidos.includes(d));
  if (c.documentos.length && !faltam.length) {
    await db().from("cobrancas_documentos").update({ ativa: false, recebido_em: agora.toISOString(), updated_at: agora.toISOString() }).eq("id", c.id);
    return { ok: false, motivo: "Todos os documentos já chegaram; a cobrança parou.", encerrada: true };
  }
  const destino = await destinoDaCobranca(c.client_id, c.destino);
  if (!destino) return { ok: false, motivo: c.destino === "grupo" ? "O cliente não tem grupo de WhatsApp vinculado." : "O cliente não tem WhatsApp vinculado." };
  const texto = preencherMensagem(c.mensagem, { cliente: ctx.cliente, titulo: ctx.titulo, documentos: faltam.length ? faltam : c.documentos });
  const n = c.envios + 1;
  const job = await enfileirarMensagem({
    para: destino.para,
    texto,
    origemRef: `cobranca-doc:${c.id}:${n}${forcar ? `:${agora.getTime()}` : ""}`,
    expiraEm: new Date(agora.getTime() + 6 * 3_600_000),
    criadoPor,
  });
  if (!job) return { ok: false, motivo: "Não consegui colocar a mensagem na fila do WhatsApp." };
  const avisar = n >= cfg.avisarApos && !c.equipe_avisada_em;
  await db()
    .from("cobrancas_documentos")
    .update({
      envios: n,
      ultima_em: agora.toISOString(),
      proxima_em: proximaCobranca(agora, c.intervalo_dias, cfg.horaInicio).toISOString(),
      ...(avisar ? { equipe_avisada_em: agora.toISOString() } : {}),
      updated_at: agora.toISOString(),
    })
    .eq("id", c.id);
  if (avisar) {
    const destinoAviso = [...new Set([...(await idsDosAdmins()), ...(ctx.responsavelProfile ? [ctx.responsavelProfile] : [])])];
    await criarAvisos(
      destinoAviso.map((profile_id) => ({
        profile_id,
        tipo: "cobranca_documento",
        titulo: `Cliente sem enviar documento: ${ctx.cliente || ctx.titulo}`,
        corpo: `Já foram ${n} cobranças no WhatsApp e ainda falta: ${listaDocumentos(faltam.length ? faltam : c.documentos)}. Vale ligar para o cliente.`,
        url: `/admin/activities/${c.activity_id}`,
      }))
    ).catch(() => undefined);
  }
  return { ok: true, rotulo: destino.rotulo, faltam };
}

/** Cron de hora em hora: manda as cobranças vencidas (só em dia útil, no horário). */
export async function processarCobrancas(): Promise<{ horario: boolean; enviadas: number; encerradas: number; falhas: string[] }> {
  const cfg = await configCobranca();
  const agora = new Date();
  if (!horarioDeCobrar(agora, cfg)) return { horario: false, enviadas: 0, encerradas: 0, falhas: [] };
  const { data } = await db().from("cobrancas_documentos").select("*").eq("ativa", true).lte("proxima_em", agora.toISOString()).order("proxima_em").limit(40);
  let enviadas = 0;
  let encerradas = 0;
  const falhas: string[] = [];
  for (const c of (data ?? []) as Cobranca[]) {
    const r = await enviarCobranca(c, cfg);
    if (r.ok) enviadas++;
    else if (r.encerrada) encerradas++;
    else {
      falhas.push(`${c.activity_id}: ${r.motivo}`);
      // sem WhatsApp: tenta de novo no próximo dia útil em vez de toda hora
      await db().from("cobrancas_documentos").update({ proxima_em: proximaCobranca(agora, 1, cfg.horaInicio).toISOString() }).eq("id", c.id);
    }
  }
  return { horario: true, enviadas, encerradas, falhas };
}

/** Cobrança de uma atividade (ou nada) + o que já chegou e por onde sai. */
export async function cobrancaDaAtividade(activityId: string) {
  const { data } = await db().from("cobrancas_documentos").select("*").eq("activity_id", activityId).maybeSingle();
  const c = data as Cobranca | null;
  if (!c) return null;
  const [recebidos, destino] = await Promise.all([documentosRecebidos(c), destinoDaCobranca(c.client_id, c.destino)]);
  return { ...c, recebidos, destinoRotulo: destino?.rotulo ?? null };
}
