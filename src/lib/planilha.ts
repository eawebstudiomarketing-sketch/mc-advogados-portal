import { strFromU8, unzipSync } from "fflate";

// Planilha do Excel (.xlsx) em texto, para o Gemini ler: uma seção por aba,
// uma linha por linha da planilha, células separadas por " | ". Lê direto o
// XML do arquivo (é um zip), sem biblioteca extra. Datas viram dd/mm/aaaa.

const MAX_LINHAS_POR_ABA = 3000;
const MAX_CARACTERES = 300_000;

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const desescapar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });

const atributo = (attrs: string, nome: string) => new RegExp(`(?:^|\\s)${nome}="([^"]*)"`).exec(attrs)?.[1];

/** Texto de um <si> ou <is>: junta os trechos <t>, ignorando a fonética (<rPh>). */
function textoRico(xml: string): string {
  const limpo = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of limpo.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) out += m[1];
  return desescapar(out);
}

/** A=0, B=1, ..., AA=26 */
function colunaDe(ref: string): number {
  const letras = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

const FORMATOS_DATA_PADRAO = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const ehFormatoDeData = (codigo: string) => /[dmyhs]/i.test(codigo.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "")) && !/^general$/i.test(codigo.trim());

function serialParaData(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000);
  const d = new Date(ms);
  const dia = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  const temHora = d.getUTCHours() || d.getUTCMinutes();
  return temHora ? `${dia} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : dia;
}

export function planilhaParaTexto(bytes: Uint8Array): string {
  let arquivos: Record<string, Uint8Array>;
  try {
    arquivos = unzipSync(bytes, { filter: (f) => /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(f.name) });
  } catch {
    throw new Error("não consegui abrir a planilha (o arquivo parece corrompido ou não é .xlsx)");
  }
  const ler = (nome: string) => (arquivos[nome] ? strFromU8(arquivos[nome]) : "");

  const compartilhadas = [...ler("xl/sharedStrings.xml").matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textoRico(m[1] ?? ""));

  // quais estilos (s="N") são de data
  const estilos = ler("xl/styles.xml");
  const formatosCustom = new Map<number, string>();
  for (const m of estilos.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = atributo(m[1], "numFmtId");
    const codigo = atributo(m[1], "formatCode");
    if (id && codigo) formatosCustom.set(Number(id), desescapar(codigo));
  }
  const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(estilos)?.[1] ?? "";
  const estiloEhData = [...cellXfs.matchAll(/<xf\b([^>]*)/g)].map((m) => {
    const id = Number(atributo(m[1], "numFmtId") ?? 0);
    const custom = formatosCustom.get(id);
    return custom !== undefined ? ehFormatoDeData(custom) : FORMATOS_DATA_PADRAO.has(id);
  });

  // abas, na ordem do arquivo
  const alvos = new Map<string, string>();
  for (const m of ler("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = atributo(m[1], "Id");
    const alvo = atributo(m[1], "Target");
    if (id && alvo) alvos.set(id, alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo}`);
  }
  const abas = [...ler("xl/workbook.xml").matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({
    nome: desescapar(atributo(m[1], "name") ?? "Planilha"),
    arquivo: alvos.get(atributo(m[1], "r:id") ?? "") ?? "",
  }));
  if (!abas.length) throw new Error("a planilha não tem abas legíveis");

  let total = 0;
  const secoes: string[] = [];
  for (const aba of abas) {
    const xml = ler(aba.arquivo);
    const linhas: string[] = [];
    let cortou = false;
    for (const lm of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const celulas: string[] = [];
      for (const cm of (lm[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1];
        const corpo = cm[2] ?? "";
        const tipo = atributo(attrs, "t");
        const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(corpo)?.[1] ?? "";
        let valor = "";
        if (tipo === "s") valor = compartilhadas[Number(v)] ?? "";
        else if (tipo === "inlineStr") valor = textoRico(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(corpo)?.[1] ?? "");
        else if (tipo === "str") valor = desescapar(v);
        else if (tipo === "b") valor = v === "1" ? "Sim" : "Não";
        else if (tipo === "e") valor = "";
        else if (v !== "") {
          const n = Number(v);
          const estilo = Number(atributo(attrs, "s") ?? 0);
          valor = Number.isFinite(n) ? (estiloEhData[estilo] ? serialParaData(n) : String(n)) : desescapar(v);
        }
        const col = colunaDe(atributo(attrs, "r") ?? "A");
        while (celulas.length < col) celulas.push("");
        celulas[col] = valor.replace(/\s*\n\s*/g, " ").trim();
      }
      while (celulas.length && celulas[celulas.length - 1] === "") celulas.pop();
      if (!celulas.length) continue;
      if (linhas.length >= MAX_LINHAS_POR_ABA) {
        cortou = true;
        break;
      }
      const linha = celulas.join(" | ");
      total += linha.length + 1;
      if (total > MAX_CARACTERES) {
        cortou = true;
        break;
      }
      linhas.push(linha);
    }
    secoes.push(`## Aba "${aba.nome}" (${linhas.length} linhas${cortou ? ", cortada: a planilha é maior que o limite de leitura" : ""})\n${linhas.join("\n") || "(vazia)"}`);
    if (total > MAX_CARACTERES) break;
  }
  return secoes.join("\n\n");
}
