"use server";

import { exigirPermissao } from "@/lib/dal";
import { cancelarAgendamento, criarAgendamento, descreverAgendamento, listarAgendamentos, recorrenciaValida } from "@/lib/zap/agendamentos";

// Mensagens agendadas na conversa do WhatsApp (04/11/2026).

export type AgendadaTela = { id: string; texto: string; quando: string; proxima: string | null; envios: number };

const tela = (a: Awaited<ReturnType<typeof listarAgendamentos>>[number]): AgendadaTela => ({
  id: a.id,
  texto: a.texto,
  quando: descreverAgendamento(a.recorrencia, a.hora) + (a.ate ? `, até ${a.ate.split("-").reverse().join("/")}` : ""),
  proxima: a.proxima_em,
  envios: a.envios,
});

export async function agendadasDaConversaAction(jid: string): Promise<AgendadaTela[]> {
  await exigirPermissao("whatsapp");
  return (await listarAgendamentos({ para: jid })).map(tela);
}

export async function agendarMensagemAction(a: { jid: string; rotulo: string; texto: string; recorrencia: unknown; hora: string; ate?: string | null }): Promise<{ ok: boolean; erro?: string; agendada?: AgendadaTela }> {
  const { profile } = await exigirPermissao("whatsapp");
  const recorrencia = recorrenciaValida(a.recorrencia);
  if (!recorrencia) return { ok: false, erro: "Escolha quando a mensagem sai." };
  if (!/^\d{2}:\d{2}$/.test(a.hora)) return { ok: false, erro: "Escolha o horário." };
  if (!a.texto.trim()) return { ok: false, erro: "Escreva a mensagem." };
  try {
    const ag = await criarAgendamento({ para: a.jid, rotulo: a.rotulo, texto: a.texto, recorrencia, hora: a.hora, ate: a.ate && /^\d{4}-\d{2}-\d{2}$/.test(a.ate) ? a.ate : null, criadoPor: profile.id });
    return { ok: true, agendada: tela(ag) };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function cancelarAgendadaAction(id: string): Promise<{ ok: boolean }> {
  await exigirPermissao("whatsapp");
  await cancelarAgendamento(id);
  return { ok: true };
}
