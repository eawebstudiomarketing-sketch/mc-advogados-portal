// Texto do Astrea: andamento vem em texto puro com quebras de linha; publicação
// vem em HTML (<br/>, <strong>, nome pesquisado em <span class="au-text-highlight">).
// Aqui vira texto com as mesmas quebras e trechos destacados, sem HTML cru na tela.

const ENTIDADES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodificar(t: string): string {
  return t.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

/** Trecho em HTML do Astrea → texto, mantendo as quebras de linha (sem aparar as pontas). */
function trechoParaTexto(html: string): string {
  return decodificar(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n");
}

export const temHtml = (t: string | null | undefined) => !!t && /<\/?[a-z][^>]*>/i.test(t);

/** Texto completo (para busca, sugestão de prazo e o assistente). */
export function htmlParaTexto(t: string | null | undefined): string {
  if (!t) return "";
  if (!temHtml(t)) return t.trim();
  return trechoParaTexto(t).replace(/\n{3,}/g, "\n\n").trim();
}

export type Segmento = { texto: string; destaque: boolean };

/** Divide o texto em trechos normais e destacados (o nome pesquisado, como no Astrea). */
export function segmentosAstrea(t: string | null | undefined): Segmento[] {
  if (!t) return [];
  if (!temHtml(t)) return [{ texto: t.trim(), destaque: false }];
  const out: Segmento[] = [];
  const re = /<span[^>]*au-text-highlight[^>]*>([\s\S]*?)<\/span>/gi;
  let i = 0;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    if (m.index > i) out.push({ texto: trechoParaTexto(t.slice(i, m.index)), destaque: false });
    out.push({ texto: trechoParaTexto(m[1]), destaque: true });
    i = m.index + m[0].length;
  }
  if (i < t.length) out.push({ texto: trechoParaTexto(t.slice(i)), destaque: false });
  // tira quebras sobrando no começo e no fim
  if (out.length) {
    out[0].texto = out[0].texto.replace(/^\s+/, "");
    out[out.length - 1].texto = out[out.length - 1].texto.replace(/\s+$/, "");
  }
  return out.filter((s) => s.texto);
}
