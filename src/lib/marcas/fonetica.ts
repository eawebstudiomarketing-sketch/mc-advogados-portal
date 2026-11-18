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

const soLetras = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pares = (s: string) => Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2));
  const px = pares(a);
  const resto = pares(b);
  if (!px.length || !resto.length) return 0;
  const total = px.length + resto.length;
  let comum = 0;
  for (const p of px) {
    const i = resto.indexOf(p);
    if (i >= 0) {
      comum++;
      resto.splice(i, 1);
    }
  }
  return (2 * comum) / total;
}

/**
 * Parecença 0–1 entre o nome pesquisado e uma marca do INPI, como o examinador olha (18/11/2026):
 * compara com a marca inteira, com cada palavra dela e com palavras vizinhas juntas, na grafia e no som.
 * Ex.: PLLIF × "PLIFF" ≈ 0,9; PLLIF × "PLAY LIFE" ≈ 0,6; PLLIF × "GROWTH HOUSE" = 0.
 */
export function parecencaNome(nome: string, marca: string): number {
  const n = soLetras(nome).replace(/ /g, "");
  const ws = soLetras(marca).split(" ").filter(Boolean);
  if (!n || !ws.length) return 0;
  const pedacos = new Set<string>([ws.join("")]);
  ws.forEach((w, i) => {
    pedacos.add(w);
    if (ws[i + 1]) pedacos.add(w + ws[i + 1]);
  });
  let melhor = 0;
  for (const p of pedacos) {
    if (p.length < 2) continue;
    const g = dice(n, p);
    const f = parecencaFonetica(n, p);
    // uma palavra curta dentro do nome (ou o nome dentro de uma palavra) também conta, mas menos
    const contem = p.length >= 3 && (n.includes(p) || p.includes(n)) ? 0.55 + 0.4 * (Math.min(n.length, p.length) / Math.max(n.length, p.length)) : 0;
    melhor = Math.max(melhor, g, f * 0.95, contem);
  }
  return Math.min(1, melhor);
}

/**
 * Grafias e radicais próximos do nome, para achar o que o INPI consideraria parecido
 * (o Marca Acompanhada fala em "campo de marcas" PL/PLL/LIF/LIFE/LIFF/PLIF para PLLIF).
 */
export function variantesDoNome(nome: string): string[] {
  const t = soLetras(nome).replace(/ /g, "");
  if (t.length < 3) return [];
  const out = new Set<string>();
  const add = (v: string) => v.length >= 3 && v !== t && out.add(v);
  const simples = t.replace(/(.)\1+/g, "$1");
  add(simples);
  // letra final dobrada / vogal final
  add(simples + simples.slice(-1));
  if (!/[AEIOU]$/.test(simples)) add(simples + "E");
  // trocas que soam igual
  const trocas: [RegExp, string][] = [
    [/Y/g, "I"], [/I/g, "Y"], [/I/g, "EE"], [/I/g, "E"], [/PH/g, "F"], [/F/g, "PH"], [/K/g, "C"], [/C(?=[AOU])/g, "K"], [/W/g, "V"], [/V/g, "W"], [/Z/g, "S"], [/S(?=[AEIOU])/g, "Z"], [/QU/g, "K"], [/X/g, "CH"], [/CH/g, "X"], [/OO/g, "U"], [/U/g, "OO"],
  ];
  for (const [re, por] of trocas) add(simples.replace(re, por));
  // radicais que formam o "campo de marcas": começo do nome e o fim com a letra dobrada ou um E
  // (PLLIF → PLIF, LIFF, LIFE). Radical de 3 letras sozinho traz milhares e é lento: fica de fora.
  if (simples.length >= 5 && simples.length <= 8) add(simples.slice(0, 4));
  else if (simples.length > 8) add(simples.slice(0, 5));
  if (simples.length >= 4 && simples.length <= 6) {
    const fim = simples.slice(-3);
    add(fim + fim.slice(-1));
    if (!/[AEIOU]$/.test(fim)) add(fim + "E");
  }
  return [...out].filter((v) => v.length >= 4).slice(0, 12);
}
