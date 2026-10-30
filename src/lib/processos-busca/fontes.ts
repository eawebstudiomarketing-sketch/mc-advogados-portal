import "server-only";
import { textoLimpo, type ComunicacaoDJEN } from "@/lib/publicacoes/djen";

// Fontes públicas da pesquisa de processo novo (30/10/2026):
//  - DJEN (Comunica PJe, CNJ): acha processos pelo número, nome da parte ou OAB; traz partes e advogados;
//  - DataJud (CNJ): dados do processo pelo número (classe, assuntos, órgão, ajuizamento, sistema, grau);
//  - BrasilAPI: razão social pelo CNPJ (o DJEN não busca por CPF/CNPJ, só por nome).
// A leitura dos andamentos no tribunal é do robô da VPS (fila em processos_candidatos).

const DJEN = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const DATAJUD = "https://api-publica.datajud.cnj.jus.br";
// chave pública do DataJud, divulgada pelo próprio CNJ na documentação da API
const DATAJUD_CHAVE = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==";
const UF = ["", "ac", "al", "ap", "am", "ba", "ce", "dft", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "se", "sp", "to"];

const RE_CNJ = /^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/;

/** Número CNJ com máscara (0000000-00.0000.0.00.0000) ou null se não tiver 20 dígitos. */
export function mascaraCnj(entrada: string): string | null {
  const m = entrada.replace(/\D/g, "").match(RE_CNJ);
  return m ? `${m[1]}-${m[2]}.${m[3]}.${m[4]}.${m[5]}.${m[6]}` : null;
}

/** Tribunal pelo número CNJ (segmento J + TR). */
export function tribunalDoNumero(numero: string): string | null {
  const m = numero.replace(/\D/g, "").match(RE_CNJ);
  if (!m) return null;
  const [j, tr] = [m[4], Number(m[5])];
  if (j === "8") return `TJ${(UF[tr] ?? "").toUpperCase()}`;
  if (j === "5") return tr === 0 ? "TST" : `TRT${tr}`;
  if (j === "4") return tr === 0 ? "CJF" : `TRF${tr}`;
  if (j === "1") return "STF";
  if (j === "3") return "STJ";
  return null;
}

export type ParteDjen = { nome: string; polo: string | null };
export type AdvogadoDjen = { nome: string; oab: string | null };

/** Um processo achado no DJEN (as publicações dele juntadas). */
export type ProcessoAchado = {
  numero: string; // com máscara
  digitos: string;
  tribunal: string | null;
  orgao: string | null;
  classe: string | null;
  partes: ParteDjen[];
  advogados: AdvogadoDjen[];
  publicacoes: number;
  ultimaPublicacao: string | null; // AAAA-MM-DD
  ultimaPublicacaoTipo: string | null;
  ultimaPublicacaoTexto: string | null;
  link: string | null;
};

async function djen(params: Record<string, string>, paginas = 2): Promise<ComunicacaoDJEN[]> {
  const todas: ComunicacaoDJEN[] = [];
  for (let pagina = 1; pagina <= paginas; pagina++) {
    const url = new URL(DJEN);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("itensPorPagina", "100");
    url.searchParams.set("pagina", String(pagina));
    const resp = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
    if (resp.status === 429) throw new Error("O diário oficial (DJEN) pediu um tempo: muitas pesquisas em 1 minuto. Tente de novo daqui a pouco.");
    if (!resp.ok) throw new Error(`O diário oficial (DJEN) respondeu ${resp.status}.`);
    const corpo = (await resp.json()) as { count?: number; items?: ComunicacaoDJEN[] };
    const itens = corpo.items ?? [];
    todas.push(...itens);
    if (itens.length < 100 || todas.length >= (corpo.count ?? 0)) break;
  }
  return todas;
}

const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o", "ao", "à", "na", "no", "por", "com", "para"]);

/** O DJEN manda a classe em maiúsculas com acento minúsculo ("AçãO TRABALHISTA"): vira "Ação Trabalhista". */
export function classeLegivel(classe: string | null | undefined): string | null {
  if (!classe) return null;
  const letras = classe.replace(/[^\p{L}]/gu, "");
  const maiusculas = letras.replace(/[^\p{Lu}]/gu, "").length;
  if (maiusculas < letras.length * 0.6) return classe.trim(); // já está normal
  return classe
    .toLocaleLowerCase("pt-BR")
    .trim()
    .split(/(\s+|-|\/)/)
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1)))
    .join("");
}

const POLO: Record<string, string> = { A: "Ativo", P: "Passivo", T: "Terceiro", D: "Destinatário" };

/** Junta as publicações por processo (mais recente primeiro). */
export function agruparPorProcesso(itens: ComunicacaoDJEN[]): ProcessoAchado[] {
  const mapa = new Map<string, ProcessoAchado>();
  const ordenadas = [...itens].sort((a, b) => (b.data_disponibilizacao ?? "").localeCompare(a.data_disponibilizacao ?? ""));
  for (const it of ordenadas) {
    const digitos = (it.numero_processo ?? "").replace(/\D/g, "");
    if (!digitos) continue;
    let p = mapa.get(digitos);
    if (!p) {
      p = {
        numero: it.numeroprocessocommascara ?? mascaraCnj(digitos) ?? digitos,
        digitos,
        tribunal: it.siglaTribunal ?? tribunalDoNumero(digitos),
        orgao: it.nomeOrgao ?? null,
        classe: classeLegivel(it.nomeClasse),
        partes: [],
        advogados: [],
        publicacoes: 0,
        ultimaPublicacao: it.data_disponibilizacao ?? null,
        ultimaPublicacaoTipo: it.tipoDocumento ?? it.tipoComunicacao ?? null,
        ultimaPublicacaoTexto: textoLimpo(it.texto).slice(0, 600) || null,
        link: it.link ?? null,
      };
      mapa.set(digitos, p);
    }
    p.publicacoes++;
    for (const d of it.destinatarios ?? []) {
      const nome = (d.nome ?? "").trim();
      if (nome && !p.partes.some((x) => x.nome === nome)) p.partes.push({ nome, polo: POLO[d.polo] ?? d.polo ?? null });
    }
    for (const a of it.destinatarioadvogados ?? []) {
      const nome = (a.advogado?.nome ?? "").trim();
      const oab = a.advogado?.numero_oab ? `${a.advogado.numero_oab}/${a.advogado.uf_oab ?? ""}` : null;
      if (nome && !p.advogados.some((x) => x.nome === nome)) p.advogados.push({ nome, oab });
    }
  }
  return [...mapa.values()];
}

export async function djenPorNumero(numero: string): Promise<ProcessoAchado | null> {
  const dig = numero.replace(/\D/g, "");
  return agruparPorProcesso(await djen({ numeroProcesso: dig }, 3)).find((p) => p.digitos === dig) ?? null;
}

export async function djenPorNome(nome: string): Promise<ProcessoAchado[]> {
  return agruparPorProcesso(await djen({ nomeParte: nome.trim() }, 3));
}

export async function djenPorOab(numero: string, uf: string): Promise<ProcessoAchado[]> {
  // sem período o DJEN devolve tudo desde 2023; 3 páginas (300 publicações) bastam para listar os casos
  return agruparPorProcesso(await djen({ numeroOab: numero.replace(/\D/g, ""), ufOab: uf.toUpperCase() }, 3));
}

/** Dados do processo no DataJud. */
export type ResumoDatajud = {
  tribunal: string | null;
  grau: string | null;
  classe: string | null;
  assuntos: string[];
  orgao: string | null;
  sistema: string | null;
  formato: string | null;
  ajuizamento: string | null; // ISO
  sigilo: number | null;
  atualizadoEm: string | null;
};

function indiceDatajud(numero: string): string | null {
  const m = numero.replace(/\D/g, "").match(RE_CNJ);
  if (!m) return null;
  const [j, tr] = [m[4], Number(m[5])];
  if (j === "8") return UF[tr] ? `tj${UF[tr]}` : null;
  if (j === "5") return tr === 0 ? "tst" : `trt${tr}`;
  if (j === "4") return tr === 0 ? null : `trf${tr}`;
  if (j === "3") return "stj";
  return null;
}

const dataDatajud = (v: string | undefined) => {
  if (!v) return null;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/); // 20260902110622
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "12"}:${m[5] ?? "00"}:00-03:00`;
  return v.length >= 10 ? v : null;
};

export async function datajudResumo(numero: string, ms = 40_000): Promise<ResumoDatajud | null> {
  const idx = indiceDatajud(numero);
  if (!idx) return null;
  const resp = await fetch(`${DATAJUD}/api_publica_${idx}/_search`, {
    method: "POST",
    headers: { Authorization: `APIKey ${DATAJUD_CHAVE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { match: { numeroProcesso: numero.replace(/\D/g, "") } }, size: 5, _source: { excludes: ["movimentos"] } }),
    cache: "no-store",
    signal: AbortSignal.timeout(ms),
  });
  if (!resp.ok) return null;
  const hits = ((await resp.json()) as { hits?: { hits?: { _source: Record<string, unknown> }[] } }).hits?.hits ?? [];
  if (!hits.length) return null;
  // vários graus: o mais recente atualizado manda
  const s = hits.map((h) => h._source).sort((a, b) => String(b.dataHoraUltimaAtualizacao ?? "").localeCompare(String(a.dataHoraUltimaAtualizacao ?? "")))[0] as {
    tribunal?: string; grau?: string; classe?: { nome?: string }; assuntos?: { nome?: string }[]; orgaoJulgador?: { nome?: string };
    sistema?: { nome?: string }; formato?: { nome?: string }; dataAjuizamento?: string; nivelSigilo?: number; dataHoraUltimaAtualizacao?: string;
  };
  const grau = s.grau === "G1" ? "1º grau" : s.grau === "G2" ? "2º grau" : s.grau === "JE" ? "Juizado especial" : s.grau === "TR" ? "Turma recursal" : (s.grau ?? null);
  return {
    tribunal: s.tribunal ?? null,
    grau,
    classe: s.classe?.nome ?? null,
    assuntos: (s.assuntos ?? []).map((a) => a?.nome).filter(Boolean) as string[],
    orgao: s.orgaoJulgador?.nome ?? null,
    sistema: s.sistema?.nome ?? null,
    formato: s.formato?.nome ?? null,
    ajuizamento: dataDatajud(s.dataAjuizamento),
    sigilo: typeof s.nivelSigilo === "number" ? s.nivelSigilo : null,
    atualizadoEm: s.dataHoraUltimaAtualizacao ?? null,
  };
}

/** Razão social pelo CNPJ (BrasilAPI). */
export async function nomePeloCnpj(cnpj: string): Promise<string | null> {
  const dig = cnpj.replace(/\D/g, "");
  if (dig.length !== 14) return null;
  const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${dig}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!resp?.ok) return null;
  const d = (await resp.json()) as { razao_social?: string };
  return d.razao_social?.trim() || null;
}
