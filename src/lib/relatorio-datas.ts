// Datas dos relatórios (sem dependências de servidor).

export const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function intervaloDoMes(ano: number, mes: number) {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const prox = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  return { inicio, fim: prox };
}

/** Segunda a domingo da semana de `hoje` (AAAA-MM-DD), fim exclusivo. */
export function intervaloDaSemana(hoje: string) {
  const d = new Date(hoje + "T12:00:00Z");
  const desdeSegunda = (d.getUTCDay() + 6) % 7;
  const ini = new Date(d.getTime() - desdeSegunda * 86_400_000);
  const fim = new Date(ini.getTime() + 7 * 86_400_000);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { inicio: iso(ini), fim: iso(fim) };
}

