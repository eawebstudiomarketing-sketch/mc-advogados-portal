import "server-only";
import { getEscritorioConfig } from "@/lib/data/escritorio";
import { cancelarPendentes, destinoDoCliente, enfileirarMensagem } from "@/lib/zap/fila";

// Lembrete do compromisso para o cliente: 24h e 1h antes, pelo grupo (ou
// número) do cliente no WhatsApp, com o texto padrão do escritório. Toda vez
// que o compromisso muda, os lembretes pendentes são refeitos.

type Compromisso = {
  /** 'audiencia' usa os 3 lembretes de audiência (criação, 5 dias e 1 dia antes) */
  tipo?: string;
  /** compromisso novo: manda o aviso de "audiência marcada" agora */
  criacao?: boolean;
  id: string;
  titulo: string;
  inicio: string;
  local: string | null;
  client_id: string | null;
  lembrar_cliente: boolean;
};

export type ResultadoLembretes = { agendados: number; destino: string | null; motivo?: string };

function preencher(modelo: string, c: Compromisso): string {
  const inicio = new Date(c.inicio);
  const data = inicio.toLocaleDateString("pt-BR", { timeZone: "America/Bahia", weekday: "long", day: "2-digit", month: "2-digit" });
  const hora = inicio.toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
  const titulo = c.titulo.charAt(0).toLowerCase() + c.titulo.slice(1);
  return modelo
    .replaceAll("{titulo}", titulo)
    .replaceAll("{data}", data)
    .replaceAll("{hora}", hora)
    .replaceAll("{local}", c.local?.trim() ? ` Local: ${c.local.trim()}.` : "")
    .replace(/\s+\./g, ".")
    .trim();
}

// ───────── Audiência (27/10/2026): igual à reunião, mas com texto e horários próprios ─────────
// na hora em que é criada no portal · 5 dias antes · 1 dia antes (09h do dia, hora da Bahia).
const TEXTO_AUDIENCIA = {
  criacao: "Olá! Informamos que foi marcada uma audiência: {titulo}, no dia {data}, às {hora}.{local} Pedimos que anote a data. Qualquer dúvida, estamos à disposição.",
  d5: "Olá! Lembrete: faltam 5 dias para a audiência {titulo}, no dia {data}, às {hora}.{local} Qualquer dúvida, estamos à disposição.",
  d1: "Olá! Amanhã, {data}, às {hora}, é a audiência {titulo}.{local} Qualquer dúvida, estamos à disposição.",
} as const;

function textoAudiencia(modelo: string, a: { titulo: string; inicio: string; local: string | null }): string {
  const inicio = new Date(a.inicio);
  return modelo
    .replaceAll("{titulo}", a.titulo)
    .replaceAll("{data}", inicio.toLocaleDateString("pt-BR", { timeZone: "America/Bahia", weekday: "long", day: "2-digit", month: "2-digit" }))
    .replaceAll("{hora}", inicio.toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" }))
    .replaceAll("{local}", a.local?.trim() ? ` Local: ${a.local.trim()}.` : "")
    .replace(/\s+\./g, ".")
    .trim();
}

export async function agendarAudiencia(a: { refBase: string; titulo: string; inicio: string; local: string | null; clientId: string | null; ativo: boolean; criacao: boolean; criadoPor?: string | null }): Promise<ResultadoLembretes> {
  await cancelarPendentes(a.refBase);
  if (!a.ativo || !a.clientId) return { agendados: 0, destino: null, motivo: "sem lembrete para cliente" };
  const config = await getEscritorioConfig();
  if (!config.lembretes_ativos) return { agendados: 0, destino: null, motivo: "lembretes desligados na Equipe" };
  const destino = await destinoDoCliente(a.clientId);
  if (!destino) return { agendados: 0, destino: null, motivo: "cliente sem grupo ou número do WhatsApp" };
  const inicio = Date.parse(a.inicio);
  const diaDaAudiencia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(inicio));
  const diaMais = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(Date.parse(`${diaDaAudiencia}T12:00:00-03:00`) + n * 86_400_000));
  let agendados = 0;
  const enviar = async (ref: string, modelo: string, quando: Date | null, expira: Date | null) => {
    const id = await enfileirarMensagem({ para: destino.para, texto: textoAudiencia(modelo, a), agendadoPara: quando, expiraEm: expira, origemRef: `${a.refBase}${ref}`, criadoPor: a.criadoPor });
    if (id) agendados++;
  };
  if (a.criacao && inicio > Date.now()) await enviar("criacao", TEXTO_AUDIENCIA.criacao, null, new Date(Date.now() + 6 * 3_600_000));
  for (const [dias, ref, modelo] of [
    [5, "d5", TEXTO_AUDIENCIA.d5],
    [1, "d1", TEXTO_AUDIENCIA.d1],
  ] as const) {
    const dia = diaMais(-dias);
    const quando = new Date(`${dia}T09:00:00-03:00`);
    if (quando.getTime() <= Date.now()) continue; // já passou: não manda atrasado
    await enviar(ref, modelo, quando, new Date(`${dia}T23:59:00-03:00`));
  }
  return { agendados, destino: destino.rotulo, motivo: agendados ? undefined : "audiência muito próxima" };
}

/** Audiência que é uma atividade (categoria "Audiência", com data e horário): mesmos lembretes. */
export async function reagendarAudienciaDaAtividade(activityId: string, opcoes: { criacao?: boolean; criadoPor?: string | null } = {}): Promise<ResultadoLembretes> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { data: a } = await createAdminClient()
    .from("activities")
    .select("id, title, deadline, hora, categoria, status, client_id, archived_at")
    .eq("id", activityId)
    .maybeSingle();
  const refBase = `audiencia:${activityId}:`;
  const valida = !!a && a.categoria === "audiencia" && !!a.deadline && !!a.hora && !a.archived_at && ["aberta", "em_andamento"].includes(String(a.status));
  if (!valida || !a) {
    await cancelarPendentes(refBase);
    return { agendados: 0, destino: null, motivo: "não é audiência aberta com data e horário" };
  }
  return agendarAudiencia({
    refBase,
    titulo: a.title,
    inicio: new Date(`${a.deadline}T${String(a.hora).slice(0, 5)}:00-03:00`).toISOString(),
    local: null,
    clientId: a.client_id,
    ativo: true,
    criacao: !!opcoes.criacao,
    criadoPor: opcoes.criadoPor,
  });
}

export async function reagendarLembretes(c: Compromisso, criadoPor?: string | null): Promise<ResultadoLembretes> {
  if (c.tipo === "audiencia") return agendarAudiencia({ refBase: `compromisso:${c.id}:`, titulo: c.titulo, inicio: c.inicio, local: c.local, clientId: c.client_id, ativo: c.lembrar_cliente, criacao: !!c.criacao, criadoPor });
  await cancelarPendentes(`compromisso:${c.id}:`);
  if (!c.lembrar_cliente || !c.client_id) return { agendados: 0, destino: null, motivo: "sem lembrete para cliente" };
  const config = await getEscritorioConfig();
  if (!config.lembretes_ativos) return { agendados: 0, destino: null, motivo: "lembretes desligados na Equipe" };
  const destino = await destinoDoCliente(c.client_id);
  if (!destino) return { agendados: 0, destino: null, motivo: "cliente sem grupo ou número do WhatsApp" };

  const inicio = Date.parse(c.inicio);
  // "amanhã" só vale até a meia-noite da véspera; "daqui a 1 hora" até 10 min antes
  const diaDoCompromisso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(inicio));
  const expira = { "24h": new Date(`${diaDoCompromisso}T00:00:00-03:00`), "1h": new Date(inicio - 10 * 60_000) };
  let agendados = 0;
  for (const [horas, modelo, ref] of [
    [24, config.lembrete_24h, "24h"],
    [1, config.lembrete_1h, "1h"],
  ] as const) {
    const quando = new Date(inicio - horas * 3_600_000);
    if (quando.getTime() <= Date.now()) continue; // já passou: não manda "amanhã" atrasado
    const id = await enfileirarMensagem({
      para: destino.para,
      texto: preencher(modelo, c),
      agendadoPara: quando,
      expiraEm: expira[ref],
      origemRef: `compromisso:${c.id}:${ref}`,
      criadoPor,
    });
    if (id) agendados++;
  }
  return { agendados, destino: destino.rotulo, motivo: agendados ? undefined : "faltam menos de 1 hora" };
}

export async function cancelarLembretes(compromissoId: string): Promise<void> {
  await cancelarPendentes(`compromisso:${compromissoId}:`);
}
