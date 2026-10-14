// Sugere o cliente de um processo pelas partes que vêm na publicação do DJEN,
// comparando nomes sem acento, pontuação e sufixos de empresa (LTDA, ME, S/A).
// É só sugestão: o formulário mostra e a pessoa confirma.

const SUFIXOS = /\b(ltda|me|epp|eireli|s\/?a|sa|cia|companhia|limitada)\b/g;

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/cpf:?\s*[\d.\-]+|cnpj:?\s*[\d./\-]+/g, " ")
    .replace(SUFIXOS, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function sugerirClientePelasPartes<T extends { id: string; name: string }>(partes: string[], clientes: T[]): T | null {
  const ps = partes.map(normalizar).filter((p) => p.length >= 4);
  if (!ps.length) return null;
  let melhor: { c: T; pontos: number } | null = null;
  for (const c of clientes) {
    const n = normalizar(c.name);
    if (n.length < 4) continue;
    for (const p of ps) {
      const pontos = p === n ? 3 : p.includes(n) || n.includes(p) ? 2 : 0;
      if (pontos && (!melhor || pontos > melhor.pontos)) melhor = { c, pontos };
    }
  }
  return melhor?.c ?? null;
}
