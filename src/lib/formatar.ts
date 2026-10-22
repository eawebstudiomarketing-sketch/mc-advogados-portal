// Máscaras de exibição (o banco guarda só os dígitos).

/** 11 dígitos = CPF (000.000.000-00); 14 = CNPJ (00.000.000/0000-00); outro formato fica como está. */
export function formatarDocumento(doc: string | null | undefined): string {
  if (!doc) return "";
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc;
}

/** +5573999998888 → (73) 99999-8888; fixo/antigo de 8 dígitos → (73) 9999-8888. */
export function formatarTelefone(tel: string | null | undefined): string {
  if (!tel) return "";
  let d = tel.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}
