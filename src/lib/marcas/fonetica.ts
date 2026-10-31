// Chave fonética simples do português para a busca "Fonética" (o pePI só tem
// exata e radical): marcas que soam igual ficam com a mesma chave
// ("KASA" ≈ "CASA", "FILIPE" ≈ "PHILIPPE").

export function chaveFonetica(s: string): string {
  let t = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  t = t
    .replace(/PH/g, "F")
    .replace(/CH|SH/g, "X")
    .replace(/LH/g, "L")
    .replace(/NH/g, "N")
    .replace(/QU|K/g, "C")
    .replace(/C(?=[EI])/g, "S")
    .replace(/[ZÇ]/g, "S")
    .replace(/W/g, "V")
    .replace(/Y/g, "I")
    .replace(/H/g, "")
    .replace(/(.)\1+/g, "$1");
  // vogais do meio pesam pouco no som da marca
  return t.slice(0, 1) + t.slice(1).replace(/[AEIOU]/g, "");
}

/** Parecença 0–1 entre as chaves fonéticas (pares de letras). */
export function parecencaFonetica(a: string, b: string): number {
  const x = chaveFonetica(a);
  const y = chaveFonetica(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const pares = (s: string) => Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2));
  const px = pares(x);
  const py = pares(y);
  if (!px.length || !py.length) return x[0] === y[0] ? 0.5 : 0;
  const resto = [...py];
  let comum = 0;
  for (const p of px) {
    const i = resto.indexOf(p);
    if (i >= 0) {
      comum++;
      resto.splice(i, 1);
    }
  }
  return (2 * comum) / (px.length + py.length);
}
