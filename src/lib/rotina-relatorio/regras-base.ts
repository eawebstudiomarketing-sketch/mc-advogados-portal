// Regras da rotina (06/11/2026, pedido do João): o que antes era fixo no código
// (horário limite do relatório, avisos, dias...) o admin máximo edita em
// Rotinas → Regras. Ficam em escritorio_config.rotina_regras (migration 0072);
// sem a coluna ou sem valor, valem os padrões abaixo (o comportamento de 05/11).
// Este arquivo serve à tela e ao servidor (sem "server-only").

export type AvisarAtraso = "ambos" | "zap" | "portal" | "nenhum";

export type RegrasRotina = {
  /** horário limite do relatório da equipe, "HH:MM" (Bahia) */
  prazo: string;
  /** horário diferente para alguém: id em responsaveis → "HH:MM" */
  excecoes: Record<string, string>;
  /** depois do limite: "aceita" = ainda envia até 23:59 com atraso; "fecha" = não aceita mais */
  depoisDoPrazo: "aceita" | "fecha";
  /** faixa fixa no topo: quantos minutos antes do limite (0 = sem faixa) */
  avisoTopoMin: number;
  /** relógio do alto fica vermelho: quantos minutos antes do limite */
  relogioVermelhoMin: number;
  /** como o admin máximo é avisado quando alguém envia com atraso */
  avisarAtraso: AvisarAtraso;
  /** dias da semana com relatório (0 = domingo … 6 = sábado) */
  dias: number[];
  /** feriado nacional não tem relatório */
  pularFeriados: boolean;
  /** resumo do fim do dia (arquivo com tudo) no WhatsApp do admin máximo */
  resumoFimDoDiaZap: boolean;
};

export const REGRAS_PADRAO: RegrasRotina = {
  prazo: "18:00",
  excecoes: {},
  depoisDoPrazo: "aceita",
  avisoTopoMin: 60,
  relogioVermelhoMin: 120,
  avisarAtraso: "ambos",
  dias: [1, 2, 3, 4, 5],
  pularFeriados: true,
  resumoFimDoDiaZap: true,
};

export const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const ehHorario = (s: unknown): s is string => typeof s === "string" && HHMM.test(s);
/** "18:30" → 1110 */
export const paraMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const inteiro = (v: unknown, min: number, max: number, padrao: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : padrao);

/** Junta o que veio do banco (ou da tela) com os padrões, descartando valor inválido. */
export function normalizarRegras(x: unknown): RegrasRotina {
  const r = (x && typeof x === "object" ? x : {}) as Partial<Record<keyof RegrasRotina, unknown>>;
  const p = REGRAS_PADRAO;
  const exc = r.excecoes && typeof r.excecoes === "object" ? Object.entries(r.excecoes as Record<string, unknown>).filter((e): e is [string, string] => /^[0-9a-f-]{36}$/i.test(e[0]) && ehHorario(e[1])) : [];
  const dias = Array.isArray(r.dias) ? [...new Set(r.dias.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : p.dias;
  return {
    prazo: ehHorario(r.prazo) ? r.prazo : p.prazo,
    excecoes: Object.fromEntries(exc),
    depoisDoPrazo: r.depoisDoPrazo === "fecha" ? "fecha" : "aceita",
    avisoTopoMin: inteiro(r.avisoTopoMin, 0, 240, p.avisoTopoMin),
    relogioVermelhoMin: inteiro(r.relogioVermelhoMin, 0, 600, p.relogioVermelhoMin),
    avisarAtraso: (["ambos", "zap", "portal", "nenhum"] as const).find((v) => v === r.avisarAtraso) ?? p.avisarAtraso,
    dias,
    pularFeriados: typeof r.pularFeriados === "boolean" ? r.pularFeriados : p.pularFeriados,
    resumoFimDoDiaZap: typeof r.resumoFimDoDiaZap === "boolean" ? r.resumoFimDoDiaZap : p.resumoFimDoDiaZap,
  };
}

/** Minuto do dia (Bahia) de um instante. */
export const minutoBahia = (d: Date | string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(d)).map((x) => [x.type, x.value]));
  return (Number(p.hour) % 24) * 60 + Number(p.minute);
};
