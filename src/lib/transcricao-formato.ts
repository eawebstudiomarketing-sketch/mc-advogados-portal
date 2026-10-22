// Texto final da transcrição (TXT, PDF, Word, Google Docs): o mesmo conteúdo
// em todos os formatos. Roda no navegador e no servidor.

export type ModoTranscricao = "fiel" | "resumo" | "ambos";
export type ParteExport = "ambos" | "texto" | "resumo";
export type OpcoesTranscricao = { falantes?: boolean; tempo?: boolean; instrucao?: string };

export type TranscricaoDados = {
  titulo: string;
  created_at: string;
  duracao_seg: number | null;
  arquivo_nome?: string | null;
  texto: string | null;
  resumo: string | null;
};

export const MODO_ROTULO: Record<ModoTranscricao, string> = {
  ambos: "Transcrição fiel + resumo",
  fiel: "Transcrição fiel",
  resumo: "Resumo com IA",
};

export function duracaoLegivel(seg: number | null | undefined): string {
  if (!seg && seg !== 0) return "";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  if (h) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m) return `${m} min ${String(s).padStart(2, "0")} s`;
  return `${s} s`;
}

export const dataLegivel = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Linha do resumo que é título de seção ("PONTOS PRINCIPAIS"). */
export const ehTituloDeSecao = (linha: string) => {
  const t = linha.trim();
  return t.length >= 4 && t.length <= 60 && t === t.toUpperCase() && /[A-ZÀ-Ú]/.test(t) && !/^[•\-–]/.test(t);
};

export type Bloco = { tipo: "titulo" | "meta" | "secao" | "subsecao" | "paragrafo"; texto: string };

/** Documento em blocos: título, dados, Resumo e/ou Transcrição. */
export function blocosDoDocumento(t: TranscricaoDados, parte: ParteExport): Bloco[] {
  const meta = [`Gerado em ${dataLegivel(t.created_at)}`, t.duracao_seg ? `Duração: ${duracaoLegivel(t.duracao_seg)}` : "", t.arquivo_nome ? `Arquivo: ${t.arquivo_nome}` : ""]
    .filter(Boolean)
    .join("  ·  ");
  const out: Bloco[] = [
    { tipo: "titulo", texto: t.titulo || "Transcrição" },
    { tipo: "meta", texto: meta },
  ];
  const incluirResumo = parte !== "texto" && t.resumo?.trim();
  const incluirTexto = parte !== "resumo" && t.texto?.trim();
  const linhas = (txt: string, comSecoes: boolean) =>
    txt
      .replace(/\r/g, "")
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l): Bloco => ({ tipo: comSecoes && ehTituloDeSecao(l) ? "subsecao" : "paragrafo", texto: l }));
  if (incluirResumo) out.push({ tipo: "secao", texto: "Resumo" }, ...linhas(t.resumo!, true));
  if (incluirTexto) out.push({ tipo: "secao", texto: "Transcrição" }, ...linhas(t.texto!, false));
  return out;
}

/** TXT simples. */
export function textoDoDocumento(t: TranscricaoDados, parte: ParteExport): string {
  const linhas: string[] = [];
  for (const b of blocosDoDocumento(t, parte)) {
    if (b.tipo === "titulo") linhas.push(b.texto.toUpperCase());
    else if (b.tipo === "meta") linhas.push(b.texto, "");
    else if (b.tipo === "secao") linhas.push("", `===== ${b.texto.toUpperCase()} =====`, "");
    else if (b.tipo === "subsecao") linhas.push("", b.texto);
    else linhas.push(b.texto, "");
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Nome de arquivo seguro a partir do título. */
export const nomeDeArquivo = (titulo: string, ext: string) =>
  `${(titulo || "Transcricao").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\s.-]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "Transcricao"}.${ext}`;
