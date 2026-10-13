import { intervaloDaSemana, intervaloDoMes, MESES } from "@/lib/relatorio-datas";

// Períodos do relatório que o cliente vê no portal dele.
export type PeriodoId = "semana" | "semana-passada" | "mes" | "mes-passado";
export const PERIODOS: { id: PeriodoId; label: string }[] = [
  { id: "semana", label: "Esta semana" },
  { id: "semana-passada", label: "Semana passada" },
  { id: "mes", label: "Este mês" },
  { id: "mes-passado", label: "Mês passado" },
];

const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const br = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const menosDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") - n * 86_400_000).toISOString().slice(0, 10);

export function resolverPeriodo(id: string | undefined) {
  const p: PeriodoId = PERIODOS.some((x) => x.id === id) ? (id as PeriodoId) : "semana";
  const hoje = hojeBahia();
  if (p === "semana" || p === "semana-passada") {
    const base = p === "semana" ? hoje : menosDias(hoje, 7);
    const { inicio, fim } = intervaloDaSemana(base);
    const ultimo = menosDias(fim, 1);
    const [ano, mes] = inicio.split("-").map(Number);
    return { id: p, inicio, fim, ano, mes, rotulo: `Semana de ${br(inicio)} a ${br(ultimo)}`, sufixo: "na semana" };
  }
  const [a, m] = hoje.split("-").map(Number);
  const ano = p === "mes" ? a : m === 1 ? a - 1 : a;
  const mes = p === "mes" ? m : m === 1 ? 12 : m - 1;
  const { inicio, fim } = intervaloDoMes(ano, mes);
  return { id: p, inicio, fim, ano, mes, rotulo: `${MESES[mes]} de ${ano}`, sufixo: "no mês" };
}
