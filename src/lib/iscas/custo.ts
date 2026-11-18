// Isca 2 (18/11/2026): quanto custa um funcionário CLT por mês para a empresa.
// Conta simples e conservadora (o mês "cheio", com as reservas que a empresa
// precisa guardar): 13º, férias + 1/3, FGTS 8%, reserva da multa de 40% do FGTS,
// INSS patronal + RAT + terceiros (27,8%, só fora do Simples), vale-transporte
// acima dos 6% do salário, alimentação e plano de saúde.

export type Regime = "simples" | "lucro";
export type EntradaCusto = { salario: number; regime: Regime; vt: number; alimentacao: number; saude: number };
export type ItemCusto = { rotulo: string; valor: number; dica: string };
export type ResultadoCusto = { total: number; anual: number; multiplicador: number; encargos: number; itens: ItemCusto[] };

export const PATRONAL = 0.278; // INSS 20% + RAT ~2% + terceiros 5,8%

export function calcularCusto(e: EntradaCusto): ResultadoCusto {
  const s = Math.max(0, e.salario);
  const decimo = s / 12;
  const ferias = s / 12 + s / 36;
  const base = s + decimo + ferias;
  const fgts = base * 0.08;
  const multa = fgts * 0.4;
  const inss = e.regime === "lucro" ? base * PATRONAL : 0;
  const vt = Math.max(0, e.vt - s * 0.06);
  const itens: ItemCusto[] = [
    { rotulo: "Salário", valor: s, dica: "O que está na carteira." },
    { rotulo: "13º salário", valor: decimo, dica: "Reserva de 1/12 por mês para pagar no fim do ano." },
    { rotulo: "Férias + 1/3", valor: ferias, dica: "Reserva mensal para as férias e o terço constitucional." },
    { rotulo: "FGTS (8%)", valor: fgts, dica: "Depósito obrigatório todo mês, também sobre 13º e férias." },
    { rotulo: "Reserva da multa do FGTS", valor: multa, dica: "40% do FGTS que a empresa paga se demitir sem justa causa." },
    ...(inss ? [{ rotulo: "INSS da empresa e outros (27,8%)", valor: inss, dica: "INSS patronal, seguro de acidente (RAT) e Sistema S." }] : []),
    ...(vt ? [{ rotulo: "Vale-transporte", valor: vt, dica: "A parte que passa dos 6% descontados do salário." }] : []),
    ...(e.alimentacao ? [{ rotulo: "Alimentação", valor: e.alimentacao, dica: "Vale-refeição ou alimentação." }] : []),
    ...(e.saude ? [{ rotulo: "Plano de saúde", valor: e.saude, dica: "Parte paga pela empresa." }] : []),
  ];
  const total = itens.reduce((a, i) => a + i.valor, 0);
  return { total, anual: total * 12, multiplicador: s ? total / s : 0, encargos: total - s, itens };
}

export const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
