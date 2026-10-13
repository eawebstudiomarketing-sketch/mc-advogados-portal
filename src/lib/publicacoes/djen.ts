// Cliente do DJEN (Diário de Justiça Eletrônico Nacional / Comunica PJe, CNJ).
// API pública, sem chave. Limite informado pelo próprio servidor: 20 consultas
// por minuto (X-RateLimit-Limit), por isso o monitor busca por OAB e não por
// processo.

const BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const POR_PAGINA = 100;
const MAX_PAGINAS = 10;

export type ComunicacaoDJEN = {
  id: number;
  data_disponibilizacao: string; // AAAA-MM-DD
  siglaTribunal: string | null;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  nomeOrgao: string | null;
  nomeClasse: string | null;
  texto: string | null;
  numero_processo: string;
  numeroprocessocommascara: string | null;
  link: string | null;
  meiocompleto: string | null;
  destinatarios?: { nome: string; polo: string }[];
  destinatarioadvogados?: { advogado?: { nome?: string; numero_oab?: string; uf_oab?: string } }[];
};

export async function buscarPorOab(numero: string, uf: string, inicio: string, fim: string): Promise<ComunicacaoDJEN[]> {
  const todas: ComunicacaoDJEN[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const url = new URL(BASE);
    url.searchParams.set("numeroOab", numero);
    url.searchParams.set("ufOab", uf);
    url.searchParams.set("dataDisponibilizacaoInicio", inicio);
    url.searchParams.set("dataDisponibilizacaoFim", fim);
    url.searchParams.set("itensPorPagina", String(POR_PAGINA));
    url.searchParams.set("pagina", String(pagina));

    const resp = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
    if (resp.status === 429) throw new Error("DJEN recusou por excesso de consultas (limite de 20/min). Tente de novo em 1 minuto.");
    if (!resp.ok) throw new Error(`DJEN respondeu ${resp.status} para a OAB ${numero}/${uf}.`);
    const corpo = (await resp.json()) as { count?: number; items?: ComunicacaoDJEN[] };
    const itens = corpo.items ?? [];
    todas.push(...itens);
    if (itens.length < POR_PAGINA || todas.length >= (corpo.count ?? 0)) break;
  }
  return todas;
}

const ENTIDADES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ordm: "º", ordf: "ª", deg: "°", sect: "§",
  aacute: "á", Aacute: "Á", eacute: "é", Eacute: "É", iacute: "í", Iacute: "Í", oacute: "ó", Oacute: "Ó",
  uacute: "ú", Uacute: "Ú", atilde: "ã", Atilde: "Ã", otilde: "õ", Otilde: "Õ", acirc: "â", Acirc: "Â",
  ecirc: "ê", Ecirc: "Ê", ocirc: "ô", Ocirc: "Ô", agrave: "à", Agrave: "À", ccedil: "ç", Ccedil: "Ç", uuml: "ü",
};

/** Alguns tribunais (eproc) mandam o texto em HTML: vira texto corrido. */
export function textoLimpo(bruto: string | null): string {
  if (!bruto) return "";
  return bruto
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|section|article|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (m, nome) => ENTIDADES[nome] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
