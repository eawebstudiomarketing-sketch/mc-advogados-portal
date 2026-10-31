// "Previsão das próximas etapas" (texto do Marca Acompanhada / do robô) em
// etapas para a linha do tempo: "Fim do prazo para oposições 31/10/2026 prazo legal
// Decisão do exame de mérito ≈ jan/2027 entre out/2026 e abr/2027 …".

export type Etapa = { etapa: string; quando: string; detalhe: string | null };

export function etapasDaPrevisao(texto: string | null | undefined): Etapa[] {
  if (!texto) return [];
  const out: Etapa[] = [];
  const re = /(.+?)\s+(?:(\d{2}\/\d{2}\/\d{4})\s+(prazo legal)|≈\s*([a-zç]{3}\/\d{4})\s+(entre [a-zç]{3}\/\d{4} e [a-zç]{3}\/\d{4})|(a qualquer momento))(?=\s|$)/gi;
  for (const m of texto.matchAll(re)) {
    out.push({ etapa: m[1].trim(), quando: m[2] ?? (m[4] ? `≈ ${m[4]}` : m[6]), detalhe: m[3] ?? m[5] ?? null });
  }
  return out.length ? out : [{ etapa: texto.trim(), quando: "", detalhe: null }];
}
