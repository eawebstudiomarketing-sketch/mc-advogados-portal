import "server-only";
import { unzipSync, strFromU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { codigoDoDespacho } from "./prazos";
import { sincronizarProcesso } from "./sincronizar";

// Revista da Propriedade Industrial (RPI) de marcas, lida pelo portal na terça
// em que sai (sem atraso): despachos da carteira, colidências e a situação
// atualizada no pePI. Baixada pela ponte da VPS (o INPI recusa a Vercel).

const db = () => createAdminClient() as unknown as SupabaseClient;
const REVISTAS = "https://revistas.inpi.gov.br";

async function ponteBin(url: string): Promise<{ tipo: string; corpo: Buffer | null; texto: string | null }> {
  const r = await fetch(`${process.env.WA_MIDIA_URL}/inpi`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WA_MIDIA_SEGREDO}`, "Content-Type": "application/json" },
    body: JSON.stringify({ passos: [{ url }] }),
    signal: AbortSignal.timeout(120_000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Ponte do INPI respondeu ${r.status}.`);
  const j = (await r.json()) as { status: number; tipo: string; corpo?: string; corpoBase64?: string };
  if (j.status >= 400) throw new Error(`INPI respondeu ${j.status} em ${url}.`);
  return { tipo: j.tipo, corpo: j.corpoBase64 ? Buffer.from(j.corpoBase64, "base64") : null, texto: j.corpo ?? null };
}

export type RevistaINPI = { numero: number; data: string; pdfs: string[] };

/** Revistas recentes na página do INPI (as últimas ~7), com os PDFs de marcas (às vezes em volumes I e II). */
export async function revistasRecentesINPI(): Promise<RevistaINPI[]> {
  const { texto } = await ponteBin(`${REVISTAS}/rpi/`);
  const out: RevistaINPI[] = [];
  for (const m of (texto ?? "").matchAll(/<tr[^>]*>\s*<td>(\d{4})<\/td>\s*<td>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/td>([\s\S]*?)<\/tr>/g)) {
    const pdfs = [...m[5].matchAll(/href=['"](https:\/\/revistas\.inpi\.gov\.br\/pdf\/Marcas[^'"]+)['"]/g)].map((x) => x[1]);
    out.push({ numero: Number(m[1]), data: `${m[4]}-${m[3]}-${m[2]}`, pdfs });
  }
  return out;
}

/** Número da revista de marcas mais recente publicada. */
export async function ultimaRevistaMarcas(): Promise<number | null> {
  const lista = await revistasRecentesINPI();
  return lista.length ? Math.max(...lista.map((r) => r.numero)) : null;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const des = (s: string) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const attr = (tag: string, nome: string) => tag.match(new RegExp(`${nome}="([^"]*)"`))?.[1] ?? null;

type ProcessoRevista = { numero: string; marca: string | null; natureza: string | null; classe: string | null; titular: string | null; despachos: { codigo: string; nome: string; texto: string | null }[] };

/** Todos os processos da revista (só os campos que o módulo usa). */
async function lerRevista(numero: number): Promise<{ data: string; processos: ProcessoRevista[] }> {
  const { corpo } = await ponteBin(`${REVISTAS}/txt/RM${numero}.zip`);
  if (!corpo) throw new Error(`Revista ${numero} não veio.`);
  const arquivos = unzipSync(new Uint8Array(corpo));
  const nomeXml = Object.keys(arquivos).find((n) => n.toLowerCase().endsWith(".xml"));
  if (!nomeXml) throw new Error(`Revista ${numero} sem XML.`);
  const xml = strFromU8(arquivos[nomeXml]);
  const d = xml.match(/<revista[^>]*data="(\d{2})\/(\d{2})\/(\d{4})"/);
  const data = d ? `${d[3]}-${d[2]}-${d[1]}` : new Date().toISOString().slice(0, 10);
  const processos: ProcessoRevista[] = [];
  for (const m of xml.matchAll(/<processo\s([^>]*)>([\s\S]*?)<\/processo>/g)) {
    const corpoP = m[2];
    const marcaTag = corpoP.match(/<marca\s([^>]*)>/);
    const nome = corpoP.match(/<nome>([\s\S]*?)<\/nome>/);
    const tit = corpoP.match(/<titular\s([^>]*)\/?>/);
    processos.push({
      numero: attr(m[1], "numero") ?? "",
      marca: nome ? des(nome[1]).trim() : null,
      natureza: marcaTag ? attr(marcaTag[1], "natureza") : null,
      classe: corpoP.match(/<classe-nice\s[^>]*codigo="([^"]+)"/)?.[1] ?? null,
      titular: tit ? des(attr(tit[1], "nome-razao-social") ?? "") : null,
      despachos: [...corpoP.matchAll(/<despacho\s([^>]*?)(?:\/>|>([\s\S]*?)<\/despacho>)/g)].map((x) => {
        const comp = x[2]?.match(/<texto-complementar>([\s\S]*?)<\/texto-complementar>/);
        return { codigo: attr(x[1], "codigo") ?? "", nome: des(attr(x[1], "nome") ?? ""), texto: comp ? des(comp[1]).trim() : null };
      }),
    });
  }
  return { data, processos };
}

// ───────────── colidência (nome) ─────────────
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function pares(s: string) {
  const t = s.replace(/ /g, "");
  const out = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) out.set(t.slice(i, i + 2), (out.get(t.slice(i, i + 2)) ?? 0) + 1);
  return out;
}
/** Semelhança 0–1 (coeficiente de Dice dos pares de letras). */
export function semelhanca(a: string, b: string): number {
  const x = pares(norm(a));
  const y = pares(norm(b));
  let comum = 0;
  let total = 0;
  for (const [k, n] of x) {
    comum += Math.min(n, y.get(k) ?? 0);
    total += n;
  }
  for (const n of y.values()) total += n;
  return total ? (2 * comum) / total : 0;
}
// palavras de ramo/descrição que aparecem em milhares de marcas e sozinhas não são colidência
const COMUNS = new Set(
  "SAUDE CASA CONSTRUCAO CONSULTORIA ENGENHARIA MELHORIA CONTINUA ESCOLA SUPERIOR AVANCADA INSTITUTO BELEZA CLINIC CLINICA ACADEMY ACADEMIA ESTRUTURA PARA EVENTOS TRANSPORTES TRANSPORTE GROUP GRUPO BRASIL BRASILEIRA SERVICOS SOLUCOES COMERCIO DISTRIBUIDORA ATACADO VAREJO STORE LOJA MODA BURGER BURGUER FOOD FOODS PIZZA PIZZARIA CAFE RESTAURANTE BAR PRODUCOES ASSESSORIA ADVOCACIA ADVOGADOS DIGITAL MARKETING TECH TECNOLOGIA EDUCACAO CURSOS STUDIO ESTUDIO CENTRO AUTOMOTIVO HOME SPORT SPORTS FITNESS PET SHOP MAIS NOVA NOVO PRIME PREMIUM ODONTOLOGIA ESTETICA IMOVEIS IMOBILIARIA SEGUROS INVESTIMENTOS NEGOCIOS GESTAO EMPRESARIAL ALIMENTOS BEBIDAS TERAPIA THERAPY SONGS MUSIC MUSICA VIAGENS TURISMO".split(" ")
);
const LIMIAR: Record<number, number> = { 1: 0.7, 2: 0.85, 3: 0.95 };
const classeNum = (c: string | null) => c?.match(/(\d{1,2})\s*$/)?.[1]?.replace(/^0/, "") ?? null;

type MarcaColid = { id: string; nome: string | null; classe: string | null; natureza: string | null; colid_auto: boolean; colid_escopo: number; colid_sensibilidade: number; colid_termos: Record<string, number>; colid_extras: string[]; colid_ignorar: string[] };

function avaliar(m: MarcaColid, p: ProcessoRevista): { score: number; risco: "alto" | "medio" } | null {
  if (!m.nome || !p.marca) return null;
  if (m.colid_escopo === 1 && classeNum(m.classe) && classeNum(p.classe) !== classeNum(m.classe)) return null;
  if (m.colid_escopo === 2 && m.natureza && p.natureza && !norm(p.natureza).includes(norm(m.natureza).split(" ")[0])) return null;
  const ignorar = new Set(m.colid_ignorar.map(norm));
  const deles = norm(p.marca).split(" ").filter((t) => !ignorar.has(t));
  const nossos = norm(m.nome).split(" ").filter((t) => t.length >= 3 && !ignorar.has(t));
  // termo de importância alta (ou extra) presente na marca de terceiro = alerta. No automático,
  // só o termo que distingue a marca (o 1º que não é palavra comum: SAÚDE, CASA, CONSULTORIA…)
  const distintivos = nossos.filter((t) => t.length >= 4 && !COMUNS.has(t));
  const altos = [...(m.colid_auto ? distintivos.slice(0, 1) : nossos.filter((t) => (m.colid_termos[t] ?? 3) === 3 && !COMUNS.has(t))), ...m.colid_extras.map(norm)];
  const termoAlto = altos.some((t) => deles.some((d) => d === t || (t.length >= 5 && semelhanca(d, t) >= 0.9)));
  const score = Math.max(semelhanca(m.nome, deles.join(" ")), termoAlto ? 0.9 : 0);
  if (score < (LIMIAR[m.colid_auto ? 2 : m.colid_sensibilidade] ?? 0.85)) return null;
  return { score: Math.round(score * 100) / 100, risco: score >= 0.92 ? "alto" : "medio" };
}

/** Lê a revista (se ainda não foi lida) e aplica na carteira. */
export async function processarRevista(numero: number, op: { forcar?: boolean; prazoMs?: number; pdfs?: string[] } = {}) {
  const inicio = Date.now();
  const banco = db();
  const { data: ja } = await banco.from("rpi_revistas").select("processada_em").eq("numero", numero).maybeSingle();
  if (ja?.processada_em && !op.forcar) return { numero, pulada: true };
  const { data, processos } = await lerRevista(numero);
  const { data: carteira } = await banco
    .from("marcas")
    .select("id, processo, nome, classe, natureza, colidencia, colid_auto, colid_escopo, colid_sensibilidade, colid_termos, colid_extras, colid_ignorar")
    .eq("acompanhando", true);
  const porProcesso = new Map((carteira ?? []).map((m) => [m.processo as string, m]));

  // 1) despachos da carteira, com o código da revista
  const tocadas = new Set<string>();
  const pubs: Record<string, unknown>[] = [];
  for (const p of processos) {
    const m = porProcesso.get(p.numero);
    if (!m) continue;
    tocadas.add(p.numero);
    for (const d of p.despachos) pubs.push({ marca_id: m.id, rpi: numero, data, codigo: codigoDoDespacho(d.codigo, d.nome), despacho: d.nome, info: d.texto });
  }
  if (pubs.length) await banco.from("marca_publicacoes").upsert(pubs, { onConflict: "marca_id,rpi,despacho" });

  // 2) colidências: pedidos novos publicados para oposição (despacho 9) parecidos com os nossos
  const comColid = (carteira ?? []).filter((m) => m.colidencia && m.nome) as MarcaColid[];
  const colid: Record<string, unknown>[] = [];
  for (const p of processos) {
    if (porProcesso.has(p.numero) || !p.despachos.some((d) => codigoDoDespacho(d.codigo, d.nome) === "9")) continue;
    for (const m of comColid) {
      const r = avaliar(m, p);
      if (r) colid.push({ marca_id: m.id, rpi: numero, processo: p.numero, nome: p.marca, classe: p.classe ? `NCL ${p.classe}` : null, titular: p.titular, despacho: p.despachos[0]?.nome ?? null, semelhanca: r.score, risco: r.risco });
    }
  }
  if (colid.length) await banco.from("marca_colidencias").upsert(colid.slice(0, 2000), { onConflict: "marca_id,processo", ignoreDuplicates: true });

  // 3) situação real no INPI das marcas que tiveram despacho (o resto o robô diário cobre)
  let sincronizadas = 0;
  for (const proc of tocadas) {
    if (Date.now() - inicio > (op.prazoMs ?? 200_000)) break;
    if ((await sincronizarProcesso(proc).catch(() => ({ ok: false }))).ok) sincronizadas++;
  }

  await banco.from("rpi_revistas").upsert({
    numero,
    data,
    processada_em: new Date().toISOString(),
    total_processos: processos.length,
    despachos_nossos: pubs.length,
    colidencias: colid.length,
    pdf_url: op.pdfs?.length ? op.pdfs.join("|") : `${REVISTAS}/pdf/Marcas${numero}.pdf`,
    erro: null,
  });
  return { numero, data, total: processos.length, despachos: pubs.length, colidencias: colid.length, sincronizadas, pendentesSync: tocadas.size - sincronizadas };
}
