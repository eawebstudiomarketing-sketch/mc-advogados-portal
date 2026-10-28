// Fim do contrato (27/10/2026): campo na seção "02 · Informações da Contratação" da ficha
// de handoff (empresa: `fim_contrato`; pessoa física: `pf_fim_contrato`). A partir dele o
// cliente mostra quanto falta e o Maurício é avisado 30 dias antes e no último dia.

type Handoff = Record<string, unknown> | null | undefined;

export const CAMPOS_FIM_CONTRATO = ["fim_contrato", "pf_fim_contrato"] as const;

/** Data (AAAA-MM-DD) do fim do contrato, se estiver preenchida na ficha. */
export function fimDoContrato(handoff: Handoff): string | null {
  for (const c of CAMPOS_FIM_CONTRATO) {
    const v = handoff?.[c];
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  }
  return null;
}

const dia = (d: string) => Date.parse(`${d}T12:00:00Z`);
const hojeBahia = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" });

/** Dias até o fim (negativo = já passou). */
export function diasParaFim(fim: string, hoje = hojeBahia()): number {
  return Math.round((dia(fim) - dia(hoje)) / 86_400_000);
}

/** "faltam 2 meses e 5 dias", "vence hoje", "venceu há 3 dias". */
export function textoFaltam(dias: number): string {
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias < 0) {
    const d = -dias;
    return d === 1 ? "venceu ontem" : d < 31 ? `venceu há ${d} dias` : `venceu há ${Math.floor(d / 30)} ${Math.floor(d / 30) === 1 ? "mês" : "meses"}`;
  }
  if (dias < 31) return `faltam ${dias} dias`;
  const meses = Math.floor(dias / 30);
  const resto = dias - meses * 30;
  return `faltam ${meses} ${meses === 1 ? "mês" : "meses"}${resto ? ` e ${resto} ${resto === 1 ? "dia" : "dias"}` : ""}`;
}

export type StatusContrato = { fim: string; dias: number; texto: string; tom: "ok" | "atencao" | "urgente" | "vencido" };

export function statusContrato(handoff: Handoff, hoje = hojeBahia()): StatusContrato | null {
  const fim = fimDoContrato(handoff);
  if (!fim) return null;
  const dias = diasParaFim(fim, hoje);
  return { fim, dias, texto: textoFaltam(dias), tom: dias < 0 ? "vencido" : dias <= 7 ? "urgente" : dias <= 30 ? "atencao" : "ok" };
}
