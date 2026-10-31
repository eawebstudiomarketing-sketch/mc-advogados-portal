// Formato dos números e endereços das fichas (marcas e patentes), para telas do
// servidor e do navegador.

/** "BR2020230167735" → "BR 20 2023 016773 5" (como o INPI e o Marca Acompanhada mostram). */
export function formatarProcesso(processo: string): string {
  const m = processo.match(/^BR(\d{2})(\d{4})(\d{6})(\d)$/);
  return m ? `BR ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : processo;
}

/** Ficha do processo: marca em /processos, patente em /patentes. */
export const linkProcesso = (tipo: string, processo: string) => (tipo === "patente" ? `/admin/marcas/patentes/${processo}` : `/admin/marcas/processos/${processo}`);
