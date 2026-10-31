// Prazos administrativos do INPI que nascem dos despachos publicados na RPI
// (Lei 9.279/96 e Resolução INPI de prazos de marcas). Mesmos nomes de ação do
// Marca Acompanhada. Os prazos contam em dias corridos a partir da data da revista.

export type RegraPrazo = { acao: string; dias: number };

/** Código do despacho (como aparece na revista, sem "IPAS") → providência e prazo. */
export const PRAZO_DO_DESPACHO: Record<string, RegraPrazo> = {
  "9": { acao: "Fim do prazo para oposições", dias: 60 },
  "24": { acao: "Recorrer de decisão de indeferimento", dias: 60 },
  "29": { acao: "Pagamento da concessão (prazo ordinário)", dias: 60 },
  "136": { acao: "Cumprir exigência de mérito", dias: 60 },
  "423": { acao: "Manifestação de oposição", dias: 60 },
  "360": { acao: "Contrarrazões ao recurso", dias: 60 },
  "400": { acao: "Manifestação no processo de nulidade", dias: 60 },
  "157": { acao: "Recorrer do arquivamento", dias: 60 },
};

const soCodigo = (c: string) => c.replace(/^IPAS/i, "").replace(/^0+/, "");

export function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function somaAnos(iso: string, anos: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + anos);
  return d.toISOString().slice(0, 10);
}

/** Prazo que um despacho abre (ou null). */
export function prazoDoDespacho(codigo: string, dataRevista: string): { acao: string; vence: string } | null {
  const r = PRAZO_DO_DESPACHO[soCodigo(codigo)];
  return r ? { acao: r.acao, vence: somaDias(dataRevista, r.dias) } : null;
}

/**
 * Decênio (prorrogação do registro): o registro vale 10 anos da concessão.
 * Prazo ordinário = último ano de vigência; extraordinário = 6 meses depois do fim.
 */
export function prazosDoDecenio(concessao: string, hoje: string): { acao: string; vence: string }[] {
  let fim = somaAnos(concessao, 10);
  while (somaDias(fim, 183) < hoje) fim = somaAnos(fim, 10); // já prorrogado antes: próximo ciclo
  const out = [{ acao: "Taxa de decênio (prazo ordinário)", vence: fim }];
  if (fim < hoje) out.push({ acao: "Taxa de decênio (prazo extraordinário)", vence: somaDias(fim, 183) });
  return out;
}
