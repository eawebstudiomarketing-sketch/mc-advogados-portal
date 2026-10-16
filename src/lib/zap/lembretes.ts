import "server-only";
import { getEscritorioConfig } from "@/lib/data/escritorio";
import { cancelarPendentes, destinoDoCliente, enfileirarMensagem } from "@/lib/zap/fila";

// Lembrete do compromisso para o cliente: 24h e 1h antes, pelo grupo (ou
// número) do cliente no WhatsApp, com o texto padrão do escritório. Toda vez
// que o compromisso muda, os lembretes pendentes são refeitos.

type Compromisso = {
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

export async function reagendarLembretes(c: Compromisso, criadoPor?: string | null): Promise<ResultadoLembretes> {
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
