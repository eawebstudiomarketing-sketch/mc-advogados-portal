import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { destinoDoCliente, enfileirarMensagem } from "@/lib/zap/fila";

// Mensagens agendadas no WhatsApp (04/11/2026): a equipe (ou o Assistente)
// agenda um texto para uma conversa, uma vez ou repetindo (todo dia, dias úteis,
// dias da semana, dia do mês). O cron de hora em hora (zap.yml → distribuicao
// ?tarefa=cobrancas, 07h30–21h30) põe na fila do Agente as que vencem nas
// próximas 12 h (cobre a madrugada), já com o horário exato
// (wa_jobs.agendado_para), e calcula a seguinte.

export type Recorrencia =
  | { tipo: "unica"; data: string }
  | { tipo: "diaria"; uteis?: boolean; inicio?: string }
  | { tipo: "semanal"; dias: number[]; inicio?: string }
  | { tipo: "mensal"; dia: number; inicio?: string };

export type Agendamento = {
  id: string;
  para: string;
  rotulo: string;
  texto: string;
  recorrencia: Recorrencia;
  hora: string;
  proxima_em: string | null;
  ultima_em: string | null;
  envios: number;
  ate: string | null;
  ativo: boolean;
  created_at: string;
};

// tabela da migration 0066 (fora do types.ts gerado)
const db = () => createAdminClient() as unknown as SupabaseClient;

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaBahia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(d);
const somaDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const semana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();
const ultimoDoMes = (dia: string) => {
  const [a, m] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0, 12)).getUTCDate();
};
const emBahia = (dia: string, hora: string) => new Date(`${dia}T${hora.slice(0, 5)}:00-03:00`);

function caiNoDia(r: Recorrencia, dia: string): boolean {
  if (r.tipo === "unica") return dia === r.data;
  if ("inicio" in r && r.inicio && dia < r.inicio) return false;
  if (r.tipo === "diaria") return !r.uteis || ![0, 6].includes(semana(dia));
  if (r.tipo === "semanal") return r.dias.includes(semana(dia));
  return Number(dia.slice(8)) === Math.min(Math.max(1, r.dia), ultimoDoMes(dia));
}

/** Próximo envio depois de `depoisDe` (ou null se não há mais: única já passou, ou passou do "até"). */
export function proximaOcorrencia(r: Recorrencia, hora: string, depoisDe: Date, ate?: string | null): Date | null {
  let dia = diaBahia(depoisDe);
  for (let n = 0; n < 400; n++, dia = somaDias(dia, 1)) {
    if (ate && dia > ate) return null;
    if (r.tipo === "unica" && dia > r.data) return null;
    if (!caiNoDia(r, dia)) continue;
    const quando = emBahia(dia, hora);
    if (quando > depoisDe) return quando;
  }
  return null;
}

/** "Uma vez em 10/11 às 09:00", "Toda seg e qua às 08:00", "Todo dia 5 às 10:00"… */
export function descreverAgendamento(r: Recorrencia, hora: string): string {
  const h = hora.slice(0, 5);
  if (r.tipo === "unica") return `Uma vez, em ${r.data.split("-").reverse().join("/")} às ${h}`;
  if (r.tipo === "diaria") return `${r.uteis ? "Todo dia útil" : "Todo dia"} às ${h}`;
  if (r.tipo === "semanal") return `Toda ${[...r.dias].sort().map((d) => DIA_CURTO[d]).join(", ")} às ${h}`;
  return `Todo dia ${r.dia} do mês às ${h}`;
}

/** Confere a repetição vinda do formulário ou do Assistente (nunca confia em quem mandou). */
export function recorrenciaValida(x: unknown): Recorrencia | null {
  const r = x as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const data = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const inicio = data(r.inicio);
  if (r.tipo === "unica" && data(r.data)) return { tipo: "unica", data: data(r.data)! };
  if (r.tipo === "diaria") return { tipo: "diaria", uteis: !!r.uteis, ...(inicio ? { inicio } : {}) };
  if (r.tipo === "semanal" && Array.isArray(r.dias)) {
    const dias = [...new Set((r.dias as unknown[]).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    return dias.length ? { tipo: "semanal", dias, ...(inicio ? { inicio } : {}) } : null;
  }
  if (r.tipo === "mensal" && Number.isInteger(Number(r.dia)) && Number(r.dia) >= 1 && Number(r.dia) <= 31) return { tipo: "mensal", dia: Number(r.dia), ...(inicio ? { inicio } : {}) };
  return null;
}

/**
 * Conversa de destino a partir do que a pessoa disse: JID, telefone, nome da
 * conversa/grupo do WhatsApp ou nome do cliente (vai para o grupo/contato dele).
 */
export async function resolverConversa(alvo: string): Promise<{ para: string; rotulo: string } | { erro: string }> {
  const t = alvo.trim();
  if (!t) return { erro: "Diga para qual conversa." };
  if (/@(g\.us|s\.whatsapp\.net)$/.test(t)) {
    const { data } = await db().from("wa_chats").select("nome").eq("chat_jid", t).maybeSingle();
    return { para: t, rotulo: (data?.nome as string | null) ?? t.split("@")[0] };
  }
  const digitos = t.replace(/\D/g, "");
  if (digitos.length >= 10 && digitos.length === t.replace(/[\s()+-]/g, "").length) return { para: digitos.startsWith("55") ? digitos : `55${digitos}`, rotulo: t };
  const termo = t.replace(/[,()%*\\]/g, " ").trim();
  const { data: chats } = await db().from("wa_chats").select("chat_jid, nome").ilike("nome", `%${termo}%`).order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(6);
  const exato = (chats ?? []).find((c) => String(c.nome ?? "").toLowerCase() === termo.toLowerCase());
  if (exato || (chats ?? []).length === 1) {
    const c = exato ?? chats![0];
    return { para: c.chat_jid as string, rotulo: (c.nome as string) ?? termo };
  }
  if ((chats ?? []).length > 1) return { erro: `Achei mais de uma conversa com "${t}": ${(chats ?? []).map((c) => c.nome).join(" · ")}. Diga qual.` };
  const { data: clientes } = await db().from("clients").select("id, name").ilike("name", `%${termo}%`).is("archived_at", null).limit(4);
  if ((clientes ?? []).length === 1) {
    const d = await destinoDoCliente(clientes![0].id as string);
    return d ? { para: d.para, rotulo: `${clientes![0].name} (${d.rotulo})` } : { erro: `O cliente ${clientes![0].name} não tem WhatsApp vinculado.` };
  }
  if ((clientes ?? []).length > 1) return { erro: `Achei mais de um cliente com "${t}": ${(clientes ?? []).map((c) => c.name).join(" · ")}. Diga qual.` };
  return { erro: `Não achei conversa nem cliente com "${t}".` };
}

export async function criarAgendamento(a: { para: string; rotulo: string; texto: string; recorrencia: Recorrencia; hora: string; ate?: string | null; criadoPor: string | null }): Promise<Agendamento> {
  const proxima = proximaOcorrencia(a.recorrencia, a.hora, new Date(), a.ate);
  if (!proxima) throw new Error("Esse horário já passou. Escolha uma data/hora futura.");
  const { data, error } = await db()
    .from("zap_agendamentos")
    .insert({ para: a.para, rotulo: a.rotulo.slice(0, 200), texto: a.texto.trim().slice(0, 4000), recorrencia: a.recorrencia, hora: a.hora.slice(0, 5), ate: a.ate ?? null, proxima_em: proxima.toISOString(), criado_por: a.criadoPor })
    .select("*")
    .single();
  if (error) throw new Error("Não foi possível agendar.");
  return data as Agendamento;
}

/** Cron de hora em hora: põe na fila do Agente o que vence nas próximas 12 h, no horário exato. */
export async function processarAgendamentos(): Promise<{ enfileiradas: number; falhas: number }> {
  const agora = new Date();
  const limite = new Date(agora.getTime() + 12 * 3_600_000);
  const { data } = await db().from("zap_agendamentos").select("*").eq("ativo", true).not("proxima_em", "is", null).lte("proxima_em", limite.toISOString()).limit(100);
  let enfileiradas = 0;
  let falhas = 0;
  for (const a of (data ?? []) as Agendamento[]) {
    // mais de uma ocorrência pode cair na janela de 12 h (ex.: todo dia às 08h e às 20h)
    let atual = a;
    for (let k = 0; k < 3 && atual.ativo && atual.proxima_em && new Date(atual.proxima_em) <= limite; k++) {
      const r = await enfileirarUma(atual, agora);
      if (!r) {
        falhas++;
        break;
      }
      enfileiradas++;
      atual = r;
    }
  }
  return { enfileiradas, falhas };
}

async function enfileirarUma(a: Agendamento, agora: Date): Promise<Agendamento | null> {
  {
    const quando = new Date(a.proxima_em!);
    const ref = `agendada:${a.id}:${quando.toISOString()}`;
    const { count } = await db().from("wa_jobs").select("id", { count: "exact", head: true }).eq("origem_ref", ref);
    const ok = count ? true : !!(await enfileirarMensagem({ para: a.para, texto: a.texto, agendadoPara: quando < agora ? null : quando, expiraEm: new Date(Math.max(quando.getTime(), agora.getTime()) + 3 * 3_600_000), origemRef: ref }));
    if (!ok) return null;
    const proxima = proximaOcorrencia(a.recorrencia, a.hora, quando, a.ate);
    const novo = { proxima_em: proxima ? proxima.toISOString() : null, ultima_em: quando.toISOString(), envios: a.envios + 1, ativo: !!proxima };
    await db().from("zap_agendamentos").update({ ...novo, updated_at: agora.toISOString() }).eq("id", a.id);
    return { ...a, ...novo };
  }
}

/** Cancela: para de repetir e tira da fila o envio que já estava agendado. */
export async function cancelarAgendamento(id: string): Promise<void> {
  const d = db();
  await d.from("zap_agendamentos").update({ ativo: false, proxima_em: null, updated_at: new Date().toISOString() }).eq("id", id);
  await d.from("wa_jobs").update({ status: "cancelado", concluido_em: new Date().toISOString() }).eq("status", "pendente").like("origem_ref", `agendada:${id}:%`);
}

export async function listarAgendamentos(op: { para?: string; todos?: boolean } = {}): Promise<Agendamento[]> {
  let q = db().from("zap_agendamentos").select("*").order("proxima_em", { ascending: true, nullsFirst: false }).limit(200);
  if (!op.todos) q = q.eq("ativo", true);
  if (op.para) q = q.eq("para", op.para);
  const { data } = await q;
  return (data ?? []) as Agendamento[];
}
