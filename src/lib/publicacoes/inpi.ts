// Revista da Propriedade Industrial (RPI) do INPI — seção de marcas.
// Sai toda terça em https://revistas.inpi.gov.br/txt/RM{numero}.zip (um XML
// com ~30 mil processos). Igual ao Astrea, o escritório é achado pelo campo
// <procurador> de cada processo.

import { unzipSync, strFromU8 } from "fflate";

const BASE = "https://revistas.inpi.gov.br";

export type DespachoINPI = { codigo: string; nome: string; texto: string | null };
export type ProcessoINPI = {
  numero: string;
  procurador: string;
  marca: string | null;
  apresentacao: string | null;
  natureza: string | null;
  titulares: { nome: string; uf: string | null }[];
  despachos: DespachoINPI[];
  classeNice: string | null;
};

/** Número da revista mais recente publicada (ex.: 2910). */
export async function ultimaRevista(): Promise<number | null> {
  const resp = await fetch(`${BASE}/rpi/`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!resp.ok) throw new Error(`INPI respondeu ${resp.status} na lista de revistas.`);
  const html = await resp.text();
  const numeros = [...html.matchAll(/RM(\d{4})\.zip/g)].map((m) => Number(m[1]));
  return numeros.length ? Math.max(...numeros) : null;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const des = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const attr = (tag: string, nome: string) => {
  const m = tag.match(new RegExp(`${nome}="([^"]*)"`));
  return m ? des(m[1]) : null;
};

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Baixa a revista e devolve a data e os processos cujos procuradores batem com algum dos nomes. */
export async function lerRevista(numero: number, procuradores: string[]): Promise<{ data: string; processos: ProcessoINPI[] }> {
  const resp = await fetch(`${BASE}/txt/RM${numero}.zip`, { cache: "no-store", signal: AbortSignal.timeout(40_000) });
  if (!resp.ok) throw new Error(`INPI respondeu ${resp.status} ao baixar a revista ${numero}.`);
  const arquivos = unzipSync(new Uint8Array(await resp.arrayBuffer()));
  const nomeXml = Object.keys(arquivos).find((n) => n.toLowerCase().endsWith(".xml"));
  if (!nomeXml) throw new Error(`Revista ${numero} sem XML.`);
  const xml = strFromU8(arquivos[nomeXml]);

  const dataBR = xml.match(/<revista[^>]*data="(\d{2})\/(\d{2})\/(\d{4})"/);
  const data = dataBR ? `${dataBR[3]}-${dataBR[2]}-${dataBR[1]}` : new Date().toISOString().slice(0, 10);
  const alvos = procuradores.map(normalizar).filter(Boolean);

  const processos: ProcessoINPI[] = [];
  for (const m of xml.matchAll(/<processo\s([^>]*)>([\s\S]*?)<\/processo>/g)) {
    const corpo = m[2];
    const pr = corpo.match(/<procurador>([\s\S]*?)<\/procurador>/);
    if (!pr) continue;
    const procurador = des(pr[1]).trim();
    const n = normalizar(procurador);
    if (!alvos.some((a) => n.includes(a))) continue;

    const marcaTag = corpo.match(/<marca\s([^>]*)>/);
    const nome = corpo.match(/<nome>([\s\S]*?)<\/nome>/);
    const despachos = [...corpo.matchAll(/<despacho\s([^>]*?)(?:\/>|>([\s\S]*?)<\/despacho>)/g)].map((d) => {
      const comp = d[2]?.match(/<texto-complementar>([\s\S]*?)<\/texto-complementar>/);
      return { codigo: attr(d[1], "codigo") ?? "", nome: attr(d[1], "nome") ?? "", texto: comp ? des(comp[1]).trim() : null };
    });
    processos.push({
      numero: attr(m[1], "numero") ?? "",
      procurador,
      marca: nome ? des(nome[1]).trim() : null,
      apresentacao: marcaTag ? attr(marcaTag[1], "apresentacao") : null,
      natureza: marcaTag ? attr(marcaTag[1], "natureza") : null,
      titulares: [...corpo.matchAll(/<titular\s([^>]*)\/?>/g)].map((t) => ({ nome: attr(t[1], "nome-razao-social") ?? "", uf: attr(t[1], "uf") })),
      despachos,
      classeNice: corpo.match(/<classe-nice\s[^>]*codigo="([^"]+)"/)?.[1] ?? null,
    });
  }
  return { data, processos };
}

// Prazos (dias corridos, Lei 9.279/96) dos despachos que exigem providência
// do titular. É sugestão: o advogado confere antes de salvar.
export const PRAZOS_INPI: Record<string, { dias: number; acao: string }> = {
  IPAS029: { dias: 60, acao: "Pagar a retribuição de concessão" },
  IPAS136: { dias: 60, acao: "Cumprir exigência de mérito" },
  IPAS024: { dias: 60, acao: "Recurso contra o indeferimento" },
  IPAS423: { dias: 60, acao: "Manifestação sobre a oposição" },
  IPAS360: { dias: 60, acao: "Contrarrazões ao recurso" },
  IPAS400: { dias: 60, acao: "Manifestação no processo de nulidade" },
};

/** Id único para a tabela de publicações (não colide com os ids do DJEN, que ficam na casa de 10^9). */
export const idPublicacaoINPI = (revista: number, processo: string) => revista * 10_000_000_000 + Number(processo);

export function textoDoProcesso(p: ProcessoINPI, revista: number, data: string): string {
  const linhas = [
    `Revista da Propriedade Industrial nº ${revista} de ${data.split("-").reverse().join("/")} — Marcas`,
    `Processo INPI ${p.numero}${p.marca ? ` · Marca: ${p.marca}` : ""}`,
    p.apresentacao || p.natureza ? `Apresentação: ${[p.apresentacao, p.natureza].filter(Boolean).join(" · ")}` : "",
    p.classeNice ? `Classe NCL: ${p.classeNice}` : "",
    `Titular: ${p.titulares.map((t) => t.nome).join("; ") || "—"}`,
    `Procurador: ${p.procurador}`,
    "",
    ...p.despachos.map((d) => `Despacho ${d.codigo} — ${d.nome}${d.texto ? `\n${d.texto}` : ""}`),
  ];
  return linhas.filter((l, i, a) => l || (i > 0 && a[i - 1])).join("\n").trim();
}
