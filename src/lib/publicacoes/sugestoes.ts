// "Tratamentos sugeridos" sem IA: regras simples que leem o texto da
// intimação e propõem um prazo ou uma audiência. É sempre sugestão — quem
// confirma a data é o advogado, no formulário da atividade.

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, "três": 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30,
};

import { PRAZOS_INPI } from "./inpi";

export type Sugestao =
  | { tipo: "prazo"; dias: number; vencimento: string; rotulo: string; acao?: string }
  | { tipo: "audiencia"; data: string; hora: string | null; rotulo: string };

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dataBR = (s: string) => s.split("-").reverse().join("/");

// Feriados nacionais fixos + recesso forense (20/12 a 20/01, art. 220 do CPC).
// Feriados locais e móveis (Carnaval, Corpus Christi) não entram: por isso o
// vencimento é só sugestão.
const FERIADOS = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]);
// O recesso suspende a CONTAGEM de prazo, mas o diário continua publicando.
function diaUtil(d: Date, recesso = true): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  const md = `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (FERIADOS.has(md)) return false;
  if (recesso && (md >= "12-20" || md <= "01-20")) return false;
  return true;
}
/** Dia de expediente (seg–sex, fora dos feriados nacionais fixos). "AAAA-MM-DD". */
export function ehDiaDeExpediente(isoDia: string): boolean {
  return diaUtil(new Date(`${isoDia}T12:00:00Z`), false);
}
function proximoDiaUtil(d: Date, recesso = true): Date {
  const x = new Date(d);
  do x.setUTCDate(x.getUTCDate() + 1);
  while (!diaUtil(x, recesso));
  return x;
}

/** Data de publicação: 1º dia útil seguinte à disponibilização no DJEN. */
export function dataPublicacao(disponibilizacao: string): string {
  return iso(proximoDiaUtil(new Date(`${disponibilizacao}T12:00:00Z`), false));
}

/**
 * Vencimento em dias úteis: considera-se publicada no 1º dia útil seguinte à
 * disponibilização, e a contagem começa no dia útil seguinte à publicação.
 */
export function vencimentoEmDiasUteis(disponibilizacao: string, dias: number): string {
  let d = proximoDiaUtil(new Date(`${disponibilizacao}T12:00:00Z`), false); // data da publicação
  for (let i = 0; i < dias; i++) d = proximoDiaUtil(d);
  return iso(d);
}

/** INPI: prazo em dias corridos a partir da data da revista; se cair em dia sem expediente, vai para o próximo dia útil. */
export function vencimentoEmDiasCorridos(dataRevista: string, dias: number): string {
  const d = new Date(`${dataRevista}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return iso(diaUtil(d, false) ? d : proximoDiaUtil(d, false));
}

export function sugerir(
  texto: string,
  disponibilizacao: string,
  opts: { tribunal?: string | null; codigos?: string[] } = {}
): Sugestao[] {
  if (opts.tribunal === "INPI") {
    // INPI: o prazo vem do código do despacho, não do texto
    const out: Sugestao[] = [];
    for (const codigo of opts.codigos ?? []) {
      const regra = PRAZOS_INPI[codigo.trim()];
      if (!regra) continue;
      const vencimento = vencimentoEmDiasCorridos(disponibilizacao, regra.dias);
      out.push({ tipo: "prazo", dias: regra.dias, vencimento, acao: regra.acao, rotulo: `${regra.acao} · ${regra.dias} dias corridos · vence ${dataBR(vencimento)}` });
    }
    return out;
  }
  const t = texto.replace(/\s+/g, " ");
  const out: Sugestao[] = [];

  const aud = t.match(/audi[êe]ncia.{0,250}?(\d{2})\/(\d{2})\/(\d{4})(?:.{0,30}?(\d{1,2})\s*(?::|h)\s*(\d{2}))?/i);
  if (aud) {
    const data = `${aud[3]}-${aud[2]}-${aud[1]}`;
    if (data >= disponibilizacao) {
      const hora = aud[4] ? `${pad(Number(aud[4]))}:${aud[5]}` : null;
      out.push({ tipo: "audiencia", data, hora, rotulo: `Audiência em ${dataBR(data)}${hora ? ` às ${hora}` : ""}` });
    }
  }

  const prazo = t.match(/prazos?\s+(?:comum\s+|sucessivo\s+|legal\s+)?(?:de\s+)?(\d{1,3}|[a-zçê]+)\s*(?:\([^)]{0,20}\)\s*)?dias?/i);
  if (prazo) {
    const bruto = prazo[1].toLowerCase();
    const dias = /^\d+$/.test(bruto) ? Number(bruto) : NUMEROS[bruto];
    if (dias && dias > 0 && dias <= 60) {
      const vencimento = vencimentoEmDiasUteis(disponibilizacao, dias);
      out.push({ tipo: "prazo", dias, vencimento, rotulo: `Prazo de ${dias} dia${dias > 1 ? "s" : ""} · vence ${dataBR(vencimento)}` });
    }
  }
  return out;
}
