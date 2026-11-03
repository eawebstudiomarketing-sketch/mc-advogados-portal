// Repetição das tarefas fixas da rotina (03/11/2026): semanal (dias da semana,
// como sempre foi) ou mensal (dia X do mês, 1º/último dia útil, ou "a 1ª/2ª/…/
// última segunda do mês"). Dia útil = segunda a sexta (feriado não entra).
// Sem "server-only": o editor usa as mesmas contas para mostrar o texto.

export type RegraMensal =
  | { tipo: "dia"; dia: number }
  | { tipo: "util"; qual: "primeiro" | "ultimo" }
  | { tipo: "semana"; ordem: 1 | 2 | 3 | 4 | -1; dia_semana: number };

export type Repeticao = { repeticao: "semanal" | "mensal"; dias: number[]; regra_mensal: RegraMensal | null };

export const NOMES_DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const ORDINAL: Record<string, string> = { "1": "1ª", "2": "2ª", "3": "3ª", "4": "4ª", "-1": "última" };

const partes = (dia: string) => {
  const [a, m, d] = dia.split("-").map(Number);
  return { a, m, d, semana: new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay(), ultimo: new Date(Date.UTC(a, m, 0, 12)).getUTCDate() };
};
const semanaDe = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay();
const util = (s: number) => s >= 1 && s <= 5;

/** Esta tarefa cai neste dia (AAAA-MM-DD)? */
export function caiNoDia(i: Repeticao, dia: string): boolean {
  const { a, m, d, semana, ultimo } = partes(dia);
  if (i.repeticao !== "mensal") return i.dias.includes(semana);
  const r = i.regra_mensal;
  if (!r) return false;
  if (r.tipo === "dia") return d === Math.min(Math.max(1, r.dia), ultimo); // dia 31 em mês de 30 cai no 30
  if (r.tipo === "util") {
    if (!util(semana)) return false;
    if (r.qual === "primeiro") {
      for (let x = 1; x < d; x++) if (util(semanaDe(a, m, x))) return false;
      return true;
    }
    for (let x = d + 1; x <= ultimo; x++) if (util(semanaDe(a, m, x))) return false;
    return true;
  }
  if (semana !== r.dia_semana) return false;
  return r.ordem === -1 ? d + 7 > ultimo : Math.ceil(d / 7) === r.ordem;
}

/** Texto curto da repetição ("Seg, Qua", "Todo dia", "Todo dia 5", "1º dia útil do mês", "Última sexta do mês"). */
export function descreverRepeticao(i: Repeticao): string {
  if (i.repeticao !== "mensal") return i.dias.length === 7 ? "Todo dia" : [...i.dias].sort().map((x) => DIA_CURTO[x]).join(", ");
  const r = i.regra_mensal;
  if (!r) return "Mensal";
  if (r.tipo === "dia") return `Todo dia ${r.dia} do mês`;
  if (r.tipo === "util") return r.qual === "primeiro" ? "1º dia útil do mês" : "Último dia útil do mês";
  const nome = NOMES_DIAS[r.dia_semana];
  return `${ORDINAL[String(r.ordem)][0].toUpperCase()}${ORDINAL[String(r.ordem)].slice(1)} ${nome} do mês`;
}

/** Confere a regra que veio do formulário (nunca confia no navegador). */
export function regraValida(x: unknown): RegraMensal | null {
  const r = x as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  if (r.tipo === "dia" && Number.isInteger(r.dia) && (r.dia as number) >= 1 && (r.dia as number) <= 31) return { tipo: "dia", dia: r.dia as number };
  if (r.tipo === "util" && (r.qual === "primeiro" || r.qual === "ultimo")) return { tipo: "util", qual: r.qual };
  if (r.tipo === "semana" && [1, 2, 3, 4, -1].includes(r.ordem as number) && Number.isInteger(r.dia_semana) && (r.dia_semana as number) >= 0 && (r.dia_semana as number) <= 6)
    return { tipo: "semana", ordem: r.ordem as 1 | 2 | 3 | 4 | -1, dia_semana: r.dia_semana as number };
  return null;
}

export type SubitemRotina = { id: string; texto: string };

/** Subitens do checklist da tarefa fixa, limpos (máx. 30, 200 caracteres cada). */
export function checklistValido(x: unknown): SubitemRotina[] {
  if (!Array.isArray(x)) return [];
  return x
    .map((s) => ({ id: String((s as SubitemRotina)?.id ?? "").slice(0, 60), texto: String((s as SubitemRotina)?.texto ?? "").trim().slice(0, 200) }))
    .filter((s) => s.id && s.texto)
    .slice(0, 30);
}
