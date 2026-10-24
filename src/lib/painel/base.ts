// Painel do Dono — peças usadas no servidor e no navegador (filtros de cada
// gráfico rodam no navegador em cima destas linhas; sem IA, sem banco).

export const DIA = 86_400_000;
export const hojeBahia = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
export const dataBahia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Bahia" });
export const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);

export type Periodo = { id: string; rotulo: string; ini: string; fim: string; iniAnterior: string; fimAnterior: string };
export const PERIODOS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "ontem", rotulo: "Ontem" },
  { id: "7d", rotulo: "7 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "30d", rotulo: "30 dias" },
  { id: "mes-anterior", rotulo: "Mês passado" },
  { id: "ano", rotulo: "Este ano" },
] as const;

export function periodoDe(id: string | undefined): Periodo {
  const agora = new Date();
  const h = hojeBahia();
  const inicioDia = (d: string) => new Date(`${d}T00:00:00-03:00`);
  const fechado = (pid: string, rotulo: string, ini: Date, fim: Date): Periodo => {
    const dur = fim.getTime() - ini.getTime();
    return { id: pid, rotulo, ini: ini.toISOString(), fim: fim.toISOString(), iniAnterior: new Date(ini.getTime() - dur).toISOString(), fimAnterior: ini.toISOString() };
  };
  switch (id) {
    case "hoje":
      return fechado("hoje", "Hoje", inicioDia(h), agora);
    case "ontem":
      return fechado("ontem", "Ontem", inicioDia(somaDias(h, -1)), inicioDia(h));
    case "7d":
      return fechado("7d", "Últimos 7 dias", new Date(agora.getTime() - 7 * DIA), agora);
    case "30d":
      return fechado("30d", "Últimos 30 dias", new Date(agora.getTime() - 30 * DIA), agora);
    case "mes-anterior": {
      const [y, m] = h.split("-").map(Number);
      const iniM = inicioDia(`${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}-01`);
      return fechado("mes-anterior", "Mês passado", iniM, inicioDia(`${h.slice(0, 7)}-01`));
    }
    case "ano":
      return fechado("ano", "Este ano", inicioDia(`${h.slice(0, 4)}-01-01`), agora);
    default:
      return fechado("mes", "Este mês", inicioDia(`${h.slice(0, 7)}-01`), agora);
  }
}

export const dentro = (iso: string | null | undefined, ini: string, fim: string) => !!iso && iso >= ini && iso < fim;
export const dias = (de: string, ate: string) => (Date.parse(ate) - Date.parse(de)) / DIA;
export const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const arred = (n: number | null, c = 1) => (n === null ? null : Math.round(n * 10 ** c) / 10 ** c);

/** Nota de satisfação (1–5) pelo tempo entre o pedido e a conclusão (ou a idade, se ainda aberta). */
export function notaPorTempo(diasCorridos: number, atrasou: boolean): number {
  const base = diasCorridos <= 1 ? 5 : diasCorridos <= 3 ? 4.5 : diasCorridos <= 7 ? 4 : diasCorridos <= 15 ? 3 : diasCorridos <= 30 ? 2 : 1;
  return Math.max(1, base - (atrasou ? 0.5 : 0));
}

export type LinhaAtividade = {
  id: string;
  titulo: string;
  status: string;
  tipo: string;
  area: string | null;
  categoria: string;
  criada: string;
  /** quando o cliente pediu (entrada na Distribuição) ou a criação */
  pedido: string;
  concluida: string | null;
  prazo: string | null;
  hora: string | null;
  atualizada: string;
  clienteId: string | null;
  respId: string | null;
  envolvidos: string[];
};
export type LinhaCliente = { id: string; nome: string; pf: boolean; ativo: boolean };
export type LinhaResp = { id: string; nome: string; profileId: string | null; foto: string | null; areas: string[] };

export const aberta = (a: LinhaAtividade) => a.status === "aberta" || a.status === "em_andamento";
export const atrasada = (a: LinhaAtividade, hoje = hojeBahia()) => aberta(a) && !!a.prazo && a.prazo < hoje;
export const noPrazo = (a: LinhaAtividade) => !a.prazo || !a.concluida || dataBahia(a.concluida) <= a.prazo;

export const TIPOS: Record<string, string> = { consultoria: "Consultoria", contrato: "Contrato", processo: "Processo", reuniao: "Reunião", pesquisa: "Pesquisa" };

/** Carga estimada de uma atividade aberta (opção A: tipo + prazo + atraso, sem campo novo). */
export function pesoAtividade(a: LinhaAtividade, hoje = hojeBahia()): number {
  if (!aberta(a)) return 0;
  let p = { processo: 3, contrato: 2, pesquisa: 2, consultoria: 1, reuniao: 1 }[a.tipo as "processo"] ?? 1;
  if (a.categoria === "audiencia") p += 2;
  if (a.prazo && a.prazo < hoje) p *= 1.3;
  else if (a.prazo && a.prazo <= somaDias(hoje, 3)) p *= 1.5;
  return p;
}

/** Nota individual (0–100) de um responsável: prazo, atrasos, rapidez e satisfação. */
export function notaPessoa(minhas: LinhaAtividade[], ini: string, fim: string, hoje = hojeBahia()) {
  const concl = minhas.filter((a) => a.status === "concluida" && dentro(a.concluida, ini, fim));
  const abertas = minhas.filter(aberta);
  const atras = abertas.filter((a) => atrasada(a, hoje));
  const tempos = concl.map((a) => dias(a.pedido, a.concluida!));
  const notas = concl.map((a) => notaPorTempo(dias(a.pedido, a.concluida!), !noPrazo(a)));
  const pPrazo = concl.length ? concl.filter(noPrazo).length / concl.length : 1;
  const pAtras = abertas.length ? atras.length / abertas.length : 0;
  const tMed = media(tempos);
  const sat = media(notas);
  // sem nada no período nem aberto: sem nota (não dá 91 de graça)
  const semDados = !concl.length && !abertas.length;
  const nota = semDados ? null : Math.round(pPrazo * 40 + (1 - Math.min(1, pAtras * 2)) * 25 + (tMed === null ? 15 : Math.max(0, 1 - tMed / 15) * 20) + (sat === null ? 11 : ((sat - 1) / 4) * 15));
  return { nota, concluidas: concl.length, noPrazoPct: concl.length ? Math.round(pPrazo * 100) : null, abertas: abertas.length, atrasadas: atras.length, tempoMedioDias: arred(tMed, 1), satisfacao: arred(sat, 1), carga: arred(abertas.reduce((s, a) => s + pesoAtividade(a, hoje), 0), 1)! };
}

/* ───────── filtro de cada quadro ───────── */
export type Filtro = { periodo: string; resp: string; cliente: string; tipo: string };
export const FILTRO_VAZIO: Filtro = { periodo: "pagina", resp: "", cliente: "", tipo: "" };

export function aplicarFiltro(linhas: LinhaAtividade[], f: Filtro, clientes: Map<string, LinhaCliente>) {
  return linhas.filter((a) => {
    if (f.resp && a.respId !== f.resp && !a.envolvidos.includes(f.resp)) return false;
    if (f.cliente === "PF" || f.cliente === "PJ") {
      const c = a.clienteId ? clientes.get(a.clienteId) : null;
      if (!c || c.pf !== (f.cliente === "PF")) return false;
    } else if (f.cliente && a.clienteId !== f.cliente) return false;
    if (f.tipo.startsWith("t:") && a.tipo !== f.tipo.slice(2)) return false;
    if (f.tipo.startsWith("a:") && a.area !== f.tipo.slice(2)) return false;
    return true;
  });
}

/** Evolução dia a dia no período (para os minigráficos): criadas, concluídas, abertas e atrasadas. */
export function seriesAtividades(ats: LinhaAtividade[], ini: string, fim: string) {
  const dias: string[] = [];
  for (let t = Date.parse(ini); t < Date.parse(fim); t += DIA) dias.push(dataBahia(new Date(t).toISOString()));
  const passo = Math.max(1, Math.ceil(dias.length / 40));
  const usados = dias.filter((_, k) => k % passo === 0 || k === dias.length - 1);
  const fimDoDia = (d: string) => new Date(`${somaDias(d, 1)}T03:00:00Z`).toISOString();
  return {
    criadas: usados.map((d) => ats.filter((a) => dataBahia(a.criada) === d).length),
    concluidas: usados.map((d) => ats.filter((a) => a.status === "concluida" && a.concluida && dataBahia(a.concluida) === d).length),
    abertas: usados.map((d) => ats.filter((a) => a.criada < fimDoDia(d) && (a.status !== "concluida" || (a.concluida && a.concluida >= fimDoDia(d))) && a.status !== "cancelada").length),
    atrasadas: usados.map((d) => ats.filter((a) => a.criada < fimDoDia(d) && (a.status !== "concluida" || (a.concluida && a.concluida >= fimDoDia(d))) && a.status !== "cancelada" && !!a.prazo && a.prazo < d).length),
  };
}
