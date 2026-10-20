// Período da agenda (Agenda e Visão geral): hoje, esta semana (seg–dom),
// este mês ou personalizado (de–até). Datas no fuso da Bahia, em AAAA-MM-DD.

export type ChavePeriodo = "hoje" | "semana" | "mes" | "personalizado";
export type Periodo = { chave: ChavePeriodo; de: string; ate: string; rotulo: string };

export const PERIODOS: { chave: ChavePeriodo; rotulo: string }[] = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "semana", rotulo: "Esta semana" },
  { chave: "mes", rotulo: "Este mês" },
  { chave: "personalizado", rotulo: "Personalizado" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

export function somaDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const dataCurtaBR = (dia: string) => dia.split("-").reverse().slice(0, 2).join("/");

/** Lê ?periodo=&de=&ate= e devolve o intervalo (padrão: `padrao`). */
export function lerPeriodo(sp: { periodo?: string; de?: string; ate?: string }, hoje: string, padrao: ChavePeriodo = "hoje"): Periodo {
  const chave = (PERIODOS.some((p) => p.chave === sp.periodo) ? sp.periodo : padrao) as ChavePeriodo;
  if (chave === "semana") {
    const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay(); // 0 = domingo
    const de = somaDias(hoje, dow === 0 ? -6 : 1 - dow);
    const ate = somaDias(de, 6);
    return { chave, de, ate, rotulo: `Semana de ${dataCurtaBR(de)} a ${dataCurtaBR(ate)}` };
  }
  if (chave === "mes") {
    const [a, m] = hoje.split("-").map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return { chave, de: `${a}-${pad(m)}-01`, ate: `${a}-${pad(m)}-${pad(ultimo)}`, rotulo: "Este mês" };
  }
  if (chave === "personalizado" && DATA.test(sp.de ?? "") && DATA.test(sp.ate ?? "")) {
    let [de, ate] = [sp.de!, sp.ate!];
    if (de > ate) [de, ate] = [ate, de];
    // no máximo ~1 ano, pra consulta não ficar pesada
    if (ate > somaDias(de, 366)) ate = somaDias(de, 366);
    return { chave, de, ate, rotulo: `${dataCurtaBR(de)} a ${dataCurtaBR(ate)}` };
  }
  if (chave === "personalizado") return { chave, de: hoje, ate: somaDias(hoje, 6), rotulo: "Escolha as datas" };
  return { chave: "hoje", de: hoje, ate: hoje, rotulo: "Hoje" };
}
