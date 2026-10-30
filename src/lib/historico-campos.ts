// Nomes dos campos do histórico (item 12), usados no servidor e no navegador.

export type EventoHistorico = { quando: string; quem: string | null; acao: "criou" | "editou" | "excluiu"; campos: string[] };

const CAMPOS: Record<string, string> = {
  title: "título",
  titulo: "título",
  name: "nome",
  description: "descrição",
  descricao: "descrição",
  deadline: "prazo",
  hora: "hora",
  status: "status",
  responsavel_id: "responsável",
  responsible_id: "responsável",
  envolvidos: "envolvidos",
  etiquetas: "etiquetas",
  checklist: "checklist",
  categoria: "categoria",
  area: "área",
  type: "tipo",
  archived_at: "arquivamento",
  concluida_em: "conclusão",
  cliente_avisado_em: "aviso ao cliente",
  client_id: "cliente",
  nascimento: "nascimento",
  telefones: "telefones",
  email_contact: "e-mail",
  documento: "CPF/CNPJ",
  endereco: "endereço",
  active: "situação",
  apelido: "apelido",
  whatsapp_grupos: "grupos do WhatsApp",
  whatsapp_numeros: "números do WhatsApp",
  handoff: "ficha de handoff",
  numero_processo: "número",
  vara_tribunal: "vara/tribunal",
  fase: "fase",
  partes: "partes",
  valor_causa: "valor da causa",
  ultimo_andamento_em: "última movimentação",
};
// mudanças que os robôs fazem sozinhos e só poluiriam a lista
export const IGNORAR = new Set(["ultimo_andamento_em", "drive_last_sync_at", "triagem_updated_at", "handoff_updated_at", "numero_digitos"]);

export const nomeDoCampo = (c: string) => CAMPOS[c] ?? c.replace(/_/g, " ");
