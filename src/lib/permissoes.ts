// O que cada advogado pode ver/fazer no painel. O admin liga/desliga na tela
// Equipe; chave ausente = liberado (o que não foi proibido é permitido), exceto
// as que têm `padrao: false`. Financeiro, Equipe, Integrações e Lixeira nunca
// aparecem para advogado (não são chaves daqui). Mesmas chaves das regras do
// banco (função tem_permissao, migration 0017).

export const PERMISSOES = [
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
  { chave: "publicacoes", grupo: "Telas", rotulo: "Publicações (diário oficial)", padrao: true },
  { chave: "relatorios", grupo: "Telas", rotulo: "Relatórios", padrao: true },
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

/** Permissões efetivas: admin tem tudo; advogado = padrão + o que o admin salvou. */
export function resolverPermissoes(role: string, salvas: unknown): Permissoes {
  if (role === "admin") return TODAS_LIBERADAS;
  const s = (salvas && typeof salvas === "object" ? salvas : {}) as Record<string, unknown>;
  return Object.fromEntries(
    PERMISSOES.map((p) => [p.chave, typeof s[p.chave] === "boolean" ? (s[p.chave] as boolean) : p.padrao])
  ) as Permissoes;
}

/** Tela do menu → chave. As que não estão aqui são só do admin. */
export const PERM_DA_TELA: Record<string, PermChave> = {
  "/admin": "visao_geral",
  "/admin/clients": "clientes",
  "/admin/agenda": "agenda",
  "/admin/distribuicao": "distribuicao",
  "/admin/activities": "atividades",
  "/admin/onboarding": "onboarding",
  "/admin/documents": "documentos",
  "/admin/contracts": "contratos",
  "/admin/processes": "processos",
  "/admin/publicacoes": "publicacoes",
  "/admin/reports": "relatorios",
};

/** Primeira tela liberada (para onde mandar quem não pode ver a Visão geral). */
export function primeiraTela(p: Permissoes): string {
  for (const [href, chave] of Object.entries(PERM_DA_TELA)) if (p[chave]) return href;
  return "/account";
}
