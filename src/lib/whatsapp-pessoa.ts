// PF ou PJ de uma conversa do WhatsApp (filtro da tela e do assistente).
// Ordem: marcação manual > cliente vinculado > grupo de Assessoria Jurídica ou
// nome de empresa (LTDA, ME, EIRELI...) = PJ > contato individual = PF.
// Grupo que não é de empresa fica sem tipo (só aparece em "Todas").

export type TipoPessoa = "PF" | "PJ";

const ASSESSORIA = /assessoria\s*-?\s*jur[ií]dica/i;
const EMPRESA = /\b(ltda|eireli|epp|cnpj|s\/a|s\.a\.)(?=$|[\s.,)-])/i;
const ME = /\b(ME|MEI)\b/; // só em maiúsculas: "me" minúsculo é palavra comum

export function tipoPessoaDaConversa(
  c: { tipo_pessoa?: string | null; is_group: boolean; nome: string | null; client_id?: string | null },
  tipoDoCliente?: (clientId: string) => string | null | undefined
): TipoPessoa | null {
  if (c.tipo_pessoa === "PF" || c.tipo_pessoa === "PJ") return c.tipo_pessoa;
  const doCliente = c.client_id ? tipoDoCliente?.(c.client_id) : null;
  if (doCliente === "PF" || doCliente === "PJ") return doCliente;
  const nome = c.nome ?? "";
  if (ASSESSORIA.test(nome) || EMPRESA.test(nome) || ME.test(nome)) return "PJ";
  return c.is_group ? null : "PF";
}
