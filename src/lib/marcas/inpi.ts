import "server-only";

// Consulta ao pePI do INPI (busca e ficha de marca) por uma ponte que faz o
// login do escritório (INPI_LOGIN/INPI_SENHA) e a consulta com os mesmos
// cookies: /api/inpi (Vercel em São Paulo) e, de reserva, WA_MIDIA_URL/inpi
// (VPS, bloqueada pelo pePI desde 31/10/2026). Só leitura no INPI.

import { consultarBase, situacaoDoDespacho, type RespostaBase } from "./base";

const PEPI = "https://busca.inpi.gov.br/pePI";
type Passo = { url: string; metodo?: "GET" | "POST"; form?: Record<string, string> };
type RespostaPonte = { status: number; url: string; tipo: string; corpo?: string; corpoBase64?: string };

async function chamar(url: string, segredo: string, passos: Passo[], ms: number): Promise<RespostaPonte> {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${segredo}`, "Content-Type": "application/json" },
    body: JSON.stringify({ latin1: true, passos }),
    signal: AbortSignal.timeout(ms),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Ponte do INPI respondeu ${r.status}.`);
  return r.json();
}

/** Primeiro a ponte da própria Vercel em São Paulo (/api/inpi, gru1); se falhar, a da VPS (reserva). */
async function ponte(passos: Passo[]): Promise<RespostaPonte> {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const cron = process.env.CRON_SECRET;
  let erro: Error | null = null;
  if (site && cron) {
    try {
      return await chamar(`${site}/api/inpi`, cron, passos, 110_000);
    } catch (e) {
      erro = e as Error;
    }
  }
  const base = process.env.WA_MIDIA_URL;
  const segredo = process.env.WA_MIDIA_SEGREDO;
  if (!base || !segredo) throw erro ?? new Error("Ponte do INPI não configurada (WA_MIDIA_URL / WA_MIDIA_SEGREDO).");
  return chamar(`${base}/inpi`, segredo, passos, 110_000);
}

function login(): Passo {
  const T_Login = process.env.INPI_LOGIN;
  const T_Senha = process.env.INPI_SENHA;
  if (!T_Login || !T_Senha) throw new Error("Login do INPI não configurado (INPI_LOGIN / INPI_SENHA).");
  return { url: `${PEPI}/servlet/LoginController`, metodo: "POST", form: { T_Login, T_Senha, action: "login", Usuario: "" } };
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const texto = (h: string) =>
  h
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ENT[e])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
const dataIso = (br: string | null | undefined) => {
  const m = br?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

export type ResultadoBusca = {
  processo: string;
  codPedido: string;
  marca: string;
  situacao: string;
  titular: string;
  classes: string;
  deposito: string | null;
  // vêm só da base própria (revistas): o pePI não mostra na lista
  apresentacao?: string | null;
  procurador?: string | null;
  ultimoDespacho?: string | null;
};

/** De onde veio o resultado: pePI ao vivo ou a base própria (revistas), quando o INPI está fora. */
export type FonteBusca = { fonte: "inpi" } | { fonte: "base"; revista: number | null; data: string | null; motivo: string };

const daBase = (b: RespostaBase): ResultadoBusca[] =>
  b.resultados.map((l) => ({
    processo: l.numero,
    codPedido: "",
    marca: l.marca ?? "",
    situacao: situacaoDoDespacho(l.ultimo_despacho, l.concessao),
    titular: [l.titular, l.uf && l.pais === "BR" ? l.uf : l.pais].filter(Boolean).join(" / "),
    classes: l.classes ? l.classes.split(",").map((c) => `NCL ${c}`).join(", ") : "",
    deposito: l.deposito,
    apresentacao: l.apresentacao,
    procurador: l.procurador,
    ultimoDespacho: l.ultimo_despacho,
  }));

/** O pePI respondeu de verdade? (fora do ar ele devolve página sem resultado nem "nenhum resultado") */
const pePIRespondeu = (html: string) => /Foram encontrados \d+ (processos|registros)|Nenhum resultado foi encontrado/.test(texto(html));
const MAX_PAGINAS = 5; // 100 por página no pePI
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Linhas da tabela de resultados do pePI. */
function lerResultados(html: string): ResultadoBusca[] {
  const out: ResultadoBusca[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const linha = m[1];
    const cod = linha.match(/CodPedido=(\d+)/);
    if (!cod) continue;
    const cels = [...linha.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => texto(c[1]));
    // checkbox · número · prioridade · apresentação(img) · marca · situação(img) · situação · titular · classe
    const numero = cels.find((c) => /^\d{9}$/.test(c));
    if (!numero) continue;
    const i = cels.indexOf(numero);
    const resto = cels.slice(i + 1).filter((c) => c !== "");
    out.push({ processo: numero, codPedido: cod[1], deposito: dataIso(resto[0]), marca: resto[1] ?? "", situacao: resto[2] ?? "", titular: resto[3] ?? "", classes: resto[4] ?? "" });
  }
  return out;
}

function passoBusca(tipo: "processo" | "nome" | "titular", termo: string): Passo {
  const t = termo.trim();
  return (
    tipo === "processo"
      ? { url: `${PEPI}/servlet/MarcasServletController`, metodo: "POST", form: { NumPedido: t.replace(/\D/g, ""), Action: "searchMarca", tipoPesquisa: "BY_NUM_PROC" } }
      : tipo === "nome"
        ? { url: `${PEPI}/servlet/MarcasServletController`, metodo: "POST", form: { buscaExata: "sim", txt: "Pesquisa Exata", marca: t.slice(0, 40), classeInter: "", registerPerPage: "100", Action: "searchMarca", tipoPesquisa: "BY_MARCA_CLASSIF_BASICA" } }
        : { url: `${PEPI}/servlet/MarcasServletController`, metodo: "POST", form: { cpf_cgc_numINPI: /^\d{11,14}$/.test(t.replace(/\D/g, "")) && !/[a-z]/i.test(t) ? t.replace(/\D/g, "") : "", nomeTitular: /[a-z]/i.test(t) ? t.slice(0, 60) : "", registerPerPage: "100", Action: "searchNome", precisao: "aproximacao", tipoPesquisa: "BY_CNPJ_NOME" } }
  );
}

/** Busca no INPI como a tela Cadastrar processos: nº do processo, nome exato da marca ou titular. */
export async function buscarNoInpi(tipo: "processo" | "nome" | "titular", termo: string, op: { semReserva?: boolean } = {}): Promise<{ resultados: ResultadoBusca[]; total: number } & FonteBusca> {
  try {
    return { ...(await buscarNoPePI(tipo, termo)), fonte: "inpi" };
  } catch (e) {
    // a conferência das marcas não usa a reserva: lá "fora do ar" tem que virar erro (tenta de novo depois)
    if (op.semReserva) throw e;
    const b = await consultarBase(tipo === "nome" ? "exata" : tipo, termo);
    return { resultados: daBase(b), total: b.total, fonte: "base", revista: b.revista, data: b.data, motivo: (e as Error).message };
  }
}

async function buscarNoPePI(tipo: "processo" | "nome" | "titular", termo: string): Promise<{ resultados: ResultadoBusca[]; total: number }> {
  if (tipo === "titular") return buscarTitularNoPePI(termo);
  const r = await ponte([{ url: `${PEPI}/` }, login(), passoBusca(tipo, termo)]);
  const html = r.corpo ?? "";
  // 05/11/2026: de madrugada o pePI devolveu página sem resultado nem "nenhum
  // resultado" (manutenção/bloqueio) e isso virava "não encontrado": a
  // conferência passou as 200 marcas sem gravar nada. Agora é erro da ponte.
  if (!pePIRespondeu(html)) throw new Error("Ponte do INPI: o pePI não devolveu a pesquisa (fora do ar ou em manutenção).");
  const total = Number(texto(html).match(/Foram encontrados (\d+) processos/)?.[1] ?? 0);
  return { resultados: lerResultados(html), total };
}

export type FichaINPI = {
  processo: string;
  codPedido: string;
  marca: string | null;
  situacao: string | null;
  apresentacao: string | null;
  natureza: string | null;
  classe: string | null;
  especificacao: string | null;
  cfe: string | null;
  titular: string | null;
  procurador: string | null;
  deposito: string | null;
  concessao: string | null;
  vigencia: string | null;
  publicacoes: { rpi: number; data: string; despacho: string; complemento: string | null }[];
  peticoes: { protocolo: string; data: string | null; servico: string; descricao: string; cliente: string | null; pagamento: string | null }[];
};

const campo = (t: string, rotulo: string, ate: string) => t.match(new RegExp(`${rotulo}\\s*(.*?)\\s*(?:${ate})`))?.[1]?.trim() || null;

function lerFicha(html: string, processo: string, codPedido: string): FichaINPI {
  const t = texto(html);
  const datas = t.match(/Data de Depósito Data de Concessão Data de Vigência .*?(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}\/\d{2}\/\d{4}))?(?:\s+(\d{2}\/\d{2}\/\d{4}))?\s+Petições/);
  const publicacoes: FichaINPI["publicacoes"] = [];
  const pubIni = html.indexOf("Complemento do Despacho");
  if (pubIni > 0) {
    for (const m of html.slice(pubIni).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const c = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => texto(x[1]));
      if (c.length >= 3 && /^\d{4}$/.test(c[0]) && dataIso(c[1])) {
        publicacoes.push({ rpi: Number(c[0]), data: dataIso(c[1])!, despacho: c[2], complemento: c[c.length - 1] && c[c.length - 1] !== "-" ? c[c.length - 1] : null });
      }
    }
  }
  // petições: tabelas aninhadas no HTML, então lê pelo texto da seção
  // ("<protocolo> <data> <serviço> Descrição do Serviço <serviço> <descrição> <cliente> - Informações do Banco: <banco> Data: … Valor: …")
  const peticoes: FichaINPI["peticoes"] = [];
  const secao = t.slice(t.indexOf("Petições"), t.indexOf("Publicações Leia-me") > 0 ? t.indexOf("Publicações Leia-me") : undefined);
  // o pagamento ("Informações do Banco: <banco> Data: … Valor: …") vem ANTES da linha a que pertence
  for (const m of secao.matchAll(/(\d{12}) (\d{2}\/\d{2}\/\d{4}) (\d+) Descrição do Serviço \d+ (.*?) -(?= Informações do Banco:|\s*$)/g)) {
    const antes = secao.slice(0, m.index);
    const banco = antes.slice(antes.lastIndexOf("Informações do Banco:") + "Informações do Banco:".length).trim();
    peticoes.push({ protocolo: m[1], data: dataIso(m[2]), servico: m[3], descricao: m[4].trim(), cliente: null, pagamento: antes.includes("Informações do Banco:") && banco ? banco : null });
  }
  return {
    processo,
    codPedido,
    marca: campo(t, "Marca:", "Situação:"),
    situacao: campo(t, "Situação:", "Apresentação:"),
    apresentacao: campo(t, "Apresentação:", "Natureza:"),
    natureza: campo(t, "Natureza:", "Classificação"),
    classe: t.match(/NCL\(\d+\)\s*\d+/)?.[0] ?? null,
    especificacao: campo(t, "Vide Situação do Processo", "Classificação Internacional de Viena|Titulares"),
    cfe: campo(t, "Edição Código Descrição", "Titulares"),
    titular: campo(t, "Titular\\(1\\):", "Titular\\(2\\)|Representante Legal|Datas"),
    procurador: campo(t, "Nome Procurador:", "Datas"),
    deposito: dataIso(datas?.[1]),
    concessao: dataIso(datas?.[2]),
    vigencia: dataIso(datas?.[3]),
    publicacoes,
    peticoes,
  };
}

/** Ficha completa do processo no INPI (situação real, publicações e petições). */
export async function fichaNoInpi(processo: string): Promise<FichaINPI | null> {
  const { resultados } = await buscarNoPePI("processo", processo);
  const achado = resultados.find((r) => r.processo === processo.replace(/\D/g, ""));
  if (!achado) return null;
  // o INPI só abre a ficha depois de uma busca na mesma sessão
  const r = await ponte([{ url: `${PEPI}/` }, login(), passoBusca("processo", processo), { url: `${PEPI}/servlet/MarcasServletController?Action=detail&CodPedido=${achado.codPedido}` }]);
  return lerFicha(r.corpo ?? "", achado.processo, achado.codPedido);
}

/** Logo da marca no INPI (data URL) ou null. */
export async function logoNoInpi(processo: string, codPedido: string): Promise<string | null> {
  const r = await ponte([{ url: `${PEPI}/` }, login(), passoBusca("processo", processo), { url: `${PEPI}/servlet/LogoMarcasServletController?Action=image&codProcesso=${codPedido}` }]);
  if (!r.corpoBase64 || !/image\//.test(r.tipo) || r.corpoBase64.length < 200) return null;
  return `data:${r.tipo.split(";")[0]};base64,${r.corpoBase64}`;
}

/** Busca de marca pelo nome (Busca Integrada / Busca com IA): exata ou radical, com classe opcional. */
export async function buscarNomeNoInpi(termo: string, radical: boolean, classe?: string | null): Promise<{ resultados: ResultadoBusca[]; total: number } & FonteBusca> {
  try {
    return { ...(await buscarNomeNoPePI(termo, radical, classe)), fonte: "inpi" };
  } catch (e) {
    const b = await consultarBase(radical ? "radical" : "exata", termo, classe);
    return { resultados: daBase(b), total: b.total, fonte: "base", revista: b.revista, data: b.data, motivo: (e as Error).message };
  }
}

async function buscarNomeNoPePI(termo: string, radical: boolean, classe?: string | null): Promise<{ resultados: ResultadoBusca[]; total: number }> {
  const passo: Passo = {
    url: `${PEPI}/servlet/MarcasServletController`,
    metodo: "POST",
    form: {
      buscaExata: radical ? "nao" : "sim",
      txt: radical ? "Pesquisa Radical" : "Pesquisa Exata",
      marca: termo.trim().slice(0, 40),
      classeInter: (classe ?? "").replace(/\D/g, ""),
      registerPerPage: "100",
      Action: "searchMarca",
      tipoPesquisa: "BY_MARCA_CLASSIF_BASICA",
    },
  };
  const r = await ponte([{ url: `${PEPI}/` }, login(), passo]);
  const html = r.corpo ?? "";
  if (!pePIRespondeu(html)) throw new Error("Ponte do INPI: o pePI não devolveu a pesquisa (fora do ar ou em manutenção).");
  const total = Number(texto(html).match(/Foram encontrados (\d+) processos/)?.[1] ?? 0);
  const resultados = lerResultados(html);
  // 09/11/2026: o pePI mostra 100 por página; antes só a 1ª era lida (MANDIN: 137, a nossa estava na 2ª)
  for (let pag = 2; pag <= Math.min(Math.ceil(total / 100), MAX_PAGINAS); pag++) {
    await pausa(3_000);
    const rp = await ponte([{ url: `${PEPI}/` }, login(), passo, { url: `${PEPI}/servlet/MarcasServletController?Action=nextPageMarca&page=${pag}` }]).catch(() => null);
    if (!rp?.corpo) break;
    resultados.push(...lerResultados(rp.corpo));
  }
  return { resultados, total };
}

/** Titular no pePI (09/11/2026): a 1ª tela lista os TITULARES ("Foram encontrados N registros");
 *  cada um abre a lista de processos (pos=0, 1…). Antes a busca parava na 1ª tela e voltava vazia. */
async function buscarTitularNoPePI(termo: string): Promise<{ resultados: ResultadoBusca[]; total: number }> {
  const passo = passoBusca("titular", termo);
  const r = await ponte([{ url: `${PEPI}/` }, login(), passo]);
  const html = r.corpo ?? "";
  if (!pePIRespondeu(html)) throw new Error("Ponte do INPI: o pePI não devolveu a pesquisa (fora do ar ou em manutenção).");
  const posicoes = [...new Set([...html.matchAll(/tipoPesquisa=BY_CNPJ_NOME&(?:amp;)?pos=(\d+)/g)].map((m) => Number(m[1])))].slice(0, 5);
  const resultados: ResultadoBusca[] = [];
  let total = 0;
  for (const pos of posicoes) {
    await pausa(3_000);
    const rp = await ponte([{ url: `${PEPI}/` }, login(), passo, { url: `${PEPI}/servlet/MarcasServletController?Action=searchMarca&tipoPesquisa=BY_CNPJ_NOME&pos=${pos}` }]).catch(() => null);
    if (!rp?.corpo) continue;
    total += Number(texto(rp.corpo).match(/Foram encontrados (\d+) processos/)?.[1] ?? 0);
    resultados.push(...lerResultados(rp.corpo));
  }
  return { resultados, total: Math.max(total, resultados.length) };
}

/** Busca por procurador: o pePI não tem; vem da base própria (revistas). */
export async function buscarProcuradorNaBase(termo: string, classe?: string | null): Promise<{ resultados: ResultadoBusca[]; total: number } & FonteBusca> {
  const b = await consultarBase("procurador", termo, classe, 300);
  return { resultados: daBase(b), total: b.total, fonte: "base", revista: b.revista, data: b.data, motivo: "Busca por procurador vem da base própria (o INPI não tem essa busca)." };
}
