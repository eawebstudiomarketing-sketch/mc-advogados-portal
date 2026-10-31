// O que cada pessoa da equipe pode ver/fazer no painel. Só o admin máximo
// (profiles.super_admin) liga/desliga, na tela Equipe. Chave ausente: admin =
// liberado; advogado = `padrao`. O admin máximo tem tudo sempre. Mesmas chaves
// das regras do banco (função tem_permissao, migrations 0017 e 0026).

export const PERMISSOES = [
  // clientes
  { chave: "todos_clientes", grupo: "Clientes", rotulo: "Ver todos os clientes (não só os designados)", padrao: false },
  { chave: "clientes_pf", grupo: "Clientes", rotulo: "Clientes pessoa física (aba Pessoas)", padrao: true },
  // telas do menu
  { chave: "visao_geral", grupo: "Telas", rotulo: "Visão geral", padrao: true },
  { chave: "clientes", grupo: "Telas", rotulo: "Clientes (fichas)", padrao: true },
  { chave: "agenda", grupo: "Telas", rotulo: "Agenda (prazos e compromissos)", padrao: true },
  { chave: "distribuicao", grupo: "Telas", rotulo: "Distribuição (demandas que chegam de fora)", padrao: true },
  { chave: "atividades", grupo: "Telas", rotulo: "Atividades", padrao: true },
  { chave: "onboarding", grupo: "Telas", rotulo: "Onboarding", padrao: true },
  { chave: "documentos", grupo: "Telas", rotulo: "Documentos", padrao: true },
  { chave: "contratos", grupo: "Telas", rotulo: "Contratos", padrao: true },
  { chave: "processos", grupo: "Telas", rotulo: "Processos", padrao: true },
  { chave: "marcas", grupo: "Telas", rotulo: "Marcas (INPI)", padrao: true },
  { chave: "publicacoes", grupo: "Telas", rotulo: "Publicações (diário oficial)", padrao: true },
  { chave: "relatorios", grupo: "Telas", rotulo: "Relatórios", padrao: true },
  // telas de gestão (antes só de admin)
  { chave: "financeiro", grupo: "Gestão", rotulo: "Financeiro", padrao: false },
  { chave: "whatsapp", grupo: "Gestão", rotulo: "WhatsApp do escritório", padrao: false },
  { chave: "equipe", grupo: "Gestão", rotulo: "Equipe (ver e convidar pessoas)", padrao: false },
  { chave: "integracoes", grupo: "Gestão", rotulo: "Integrações (Google Drive)", padrao: false },
  { chave: "lixeira", grupo: "Gestão", rotulo: "Lixeira", padrao: false },
  // partes sensíveis da ficha do cliente
  { chave: "ficha_handoff", grupo: "Áreas do cliente", rotulo: "Ficha de handoff", padrao: true },
  { chave: "atas", grupo: "Áreas do cliente", rotulo: "ATAs de reunião", padrao: true },
  { chave: "demandas", grupo: "Áreas do cliente", rotulo: "Demandas da IA", padrao: true },
  { chave: "acesso_portal", grupo: "Áreas do cliente", rotulo: "Acesso do cliente ao portal", padrao: true },
  { chave: "assistente", grupo: "Ferramentas", rotulo: "Assistente (IA)", padrao: true },
  // o que aparece na Visão geral e na Agenda
  { chave: "ver_equipe", grupo: "Visão da equipe", rotulo: "Ranking e demandas dos outros da equipe", padrao: false },
  // ações
  { chave: "editar_cliente", grupo: "Ações", rotulo: "Editar e arquivar cliente", padrao: true },
  { chave: "excluir", grupo: "Ações", rotulo: "Excluir (atividades, documentos, clientes…)", padrao: true },
  { chave: "gerar_ia", grupo: "Ações", rotulo: "Gerar com IA (onboarding, demandas, relatórios)", padrao: true },
  // ("atividades em que é responsável" deixou de ser exceção: o responsável
  // sempre vê a própria atividade — migration 0022)
] as const;

export type PermChave = (typeof PERMISSOES)[number]["chave"];
export type Permissoes = Record<PermChave, boolean>;

export const TODAS_LIBERADAS = Object.fromEntries(PERMISSOES.map((p) => [p.chave, true])) as Permissoes;

/**
 * Permissões efetivas: admin máximo tem tudo; os outros = o que foi salvo
 * para eles, e no que não foi salvo o padrão (admin: liberado; advogado: `padrao`).
 */
export function resolverPermissoes(role: string, salvas: unknown, superAdmin = false): Permissoes {
  if (superAdmin) return TODAS_LIBERADAS;
  const s = (salvas && typeof salvas === "object" ? salvas : {}) as Record<string, unknown>;
  return Object.fromEntries(
    PERMISSOES.map((p) => [p.chave, typeof s[p.chave] === "boolean" ? (s[p.chave] as boolean) : role === "admin" ? true : p.padrao])
  ) as Permissoes;
}

/** Tudo liberado? (admin sem nenhuma restrição continua com acesso pleno.) */
export const tudoLiberado = (p: Permissoes) => PERMISSOES.every((x) => p[x.chave]);

/** Tela do menu → chave. As que não estão aqui são só do admin. */
export const PERM_DA_TELA: Record<string, PermChave> = {
  "/admin": "visao_geral",
  "/admin/clients": "clientes",
  "/admin/agenda": "agenda",
  "/admin/distribuicao": "distribuicao",
  "/admin/activities": "atividades",
  "/admin/onboarding": "onboarding",
  "/admin/regimentos": "onboarding",
  "/admin/atas": "atas",
  "/admin/ia": "assistente",
  "/admin/documents": "documentos",
  "/admin/contracts": "contratos",
  "/admin/processes": "processos",
  "/admin/marcas": "marcas",
  "/admin/alertas": "publicacoes",
  "/admin/andamentos": "processos",
  "/admin/publicacoes": "publicacoes",
  "/admin/reports": "relatorios",
  "/admin/financial": "financeiro",
  "/admin/whatsapp": "whatsapp",
  "/admin/team": "equipe",
  "/admin/integracoes": "integracoes",
  "/admin/lixeira": "lixeira",
};

/** Primeira tela liberada (para onde mandar quem não pode ver a Visão geral). */
export function primeiraTela(p: Permissoes): string {
  for (const [href, chave] of Object.entries(PERM_DA_TELA)) if (p[chave]) return href;
  return "/account";
}
