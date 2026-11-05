import "server-only";
import type { Content } from "@google/genai";
import { TOOLS, podeUsar, type Ctx, type ToolDef } from "./tools";

// Ferramentas do assistente por assunto (04/11/2026, corte de custo do Gemini).
// Antes, as 127 ferramentas iam em TODA chamada (~16 mil tokens, ~90% do custo).
// Agora vai o núcleo + os grupos do assunto (pela mensagem, pela tela e pelo que
// a conversa já usou). Se faltar algo, a IA chama carregar_ferramentas e a
// rodada seguinte já vem com o grupo. Ferramenta nova que não estiver em nenhum
// grupo vai sempre (nunca some do assistente por esquecimento).

type Grupo = { id: string; sobre: string; ferramentas: string[]; palavras?: RegExp; telas?: string[] };

const NUCLEO = [
  "buscar_clientes", "ver_cliente", "listar_atividades", "criar_atividade", "atualizar_atividade", "abrir_tela",
  "agenda_do_dia", "criar_compromisso", "listar_compromissos", "base_de_conhecimento",
];

const GRUPOS: Grupo[] = [
  {
    id: "clientes",
    sobre: "cadastro de cliente (criar, editar, arquivar, excluir), ficha de handoff/onboarding, demandas proativas, aniversários, relatório mensal",
    ferramentas: ["criar_cliente", "atualizar_cliente", "arquivar_cliente", "excluir_cliente", "campos_da_ficha_handoff", "preencher_ficha_handoff", "gerar_demandas", "aniversarios_clientes", "listar_relatorios", "gerar_relatorio"],
    palavras: /client|cadastr|ficha|onboarding|handoff|proativ|anivers|relat[oó]rio|empresa|cnpj|cpf|endere[cç]|telefone|e-?mail/i,
    telas: ["/admin/clients", "/admin/onboarding", "/admin/relatorios"],
  },
  {
    id: "atividades",
    sobre: "atividades em massa, arquivar/excluir atividade, checklist, etiquetas, cobrança de documento ao cliente, avisar cliente que concluiu, mensagem interna da equipe, excluir compromisso",
    ferramentas: ["atualizar_atividades_em_massa", "arquivar_atividades", "excluir_atividade", "checklist_atividade", "listar_etiquetas", "criar_etiqueta", "editar_etiqueta", "excluir_etiqueta", "etiquetar_atividade", "avisar_cliente_atividade_concluida", "mensagem_para_equipe", "cobrar_documento_cliente", "cobrancas_de_documento", "documento_recebido", "excluir_compromisso"],
    palavras: /atividad|tarefa|etiquet|checklist|arquiv|exclu|apag|remov|conclu|cobr|pend[eê]n|respons[aá]vel|equipe|avis|compromisso|desmarc|cancel/i,
    telas: ["/admin/activities", "/admin/kanban", "/admin/agenda"],
  },
  {
    id: "documentos",
    sobre: "documentos do portal, Google Drive, anexos da conversa (ler, guardar, trazer, excluir)",
    ferramentas: ["listar_documentos", "link_documento", "ler_documento", "excluir_documento", "buscar_no_drive", "ler_arquivo_drive", "trazer_do_drive", "ler_anexo", "salvar_anexo"],
    palavras: /document|arquivo|drive|pdf|docx|planilha|contrato|procura[cç]|anexo|\[anexo:|lei[at]|resum|link/i,
    telas: ["/admin/documents", "/admin/drive"],
  },
  {
    id: "processos",
    sobre: "processos (criar, atualizar, pesquisar processo novo, aprovar), andamentos, publicações/intimações, alertas, histórico manual, etiquetas de processo",
    ferramentas: ["listar_processos", "criar_processo", "atualizar_processo", "listar_andamentos", "andamentos_do_processo", "marcar_andamentos", "ler_andamentos_agora", "vincular_cliente_processo", "listar_alertas_publicacoes", "tratar_publicacao", "encaminhar_publicacao", "adicionar_historico_manual", "comentar_andamento", "marcar_andamento_importante", "etiqueta_processos", "pesquisar_processo_novo", "processos_aguardando_aprovacao", "aprovar_processo_novo", "descartar_processo_novo"],
    palavras: /process|andament|publica|intima|alerta|vara|tribunal|pje|cnj|audi[eê]ncia|senten|despach|\d{7}-?\d{2}\.?\d{4}/i,
    telas: ["/admin/processos", "/admin/alertas", "/admin/processes"],
  },
  {
    id: "whatsapp",
    sobre: "WhatsApp do escritório: conversas, ler, triagem, enviar/editar/apagar/encaminhar mensagem, grupos, leads, relatório pelo zap, mensagens agendadas e rápidas",
    ferramentas: ["whatsapp_status", "whatsapp_conversas", "whatsapp_marcar_pf_pj", "whatsapp_ler_conversa", "whatsapp_triagem", "whatsapp_enviar_mensagem", "whatsapp_enviar_relatorio", "whatsapp_enviar_lote", "whatsapp_vincular_cliente", "whatsapp_registrar_lead", "whatsapp_reagir", "whatsapp_editar_mensagem", "whatsapp_apagar_para_todos", "whatsapp_encaminhar", "whatsapp_ajustar_conversa", "whatsapp_perfil", "whatsapp_gerenciar_grupo", "whatsapp_criar_grupo", "whatsapp_sair_do_grupo", "mensagens_rapidas", "salvar_mensagem_rapida", "agendar_mensagem_zap", "mensagens_agendadas", "cancelar_mensagem_agendada"],
    palavras: /zap|whats|mensag|grupo|conversa|envi|mand|respond|lead|contato|n[uú]mero|agend|lembr|reag|encaminh|triag|atalho/i,
    telas: ["/admin/whatsapp"],
  },
  {
    id: "distribuicao",
    sobre: "Distribuição (caixa de entrada de pedidos): listar, subir pedido, distribuir, descartar, ler o zap agora, ligar/desligar a leitura de um grupo",
    ferramentas: ["listar_distribuicao", "enviar_para_distribuicao", "ler_whatsapp_para_distribuicao", "distribuir_demanda", "descartar_demanda", "whatsapp_ler_para_distribuicao", "whatsapp_conversas_lidas"],
    palavras: /distribu|demanda|pedido|caixa de entrada|subir|sobe|triag/i,
    telas: ["/admin/distribuicao"],
  },
  {
    id: "reunioes",
    sobre: "atas e reuniões (gerar, aprovar, assinaturas ZapSign, links), transcrições e áudios do WhatsApp",
    ferramentas: ["listar_transcricoes", "ler_transcricao", "listar_audios_whatsapp", "transcrever_audio_whatsapp", "listar_atas", "ler_ata", "assinaturas_da_ata", "reenviar_link_ata", "link_de_assinatura", "atualizar_ata_zapsign", "ler_reuniao", "gerar_ata_da_reuniao", "aprovar_ata"],
    palavras: /\bata\b|\batas\b|reuni|transcri|[aá]udio|grava[cç]|assinat|zapsign|regimento/i,
    telas: ["/admin/atas", "/admin/transcricao", "/admin/reunioes", "/admin/regimento"],
  },
  {
    id: "gestao",
    sobre: "rotinas (minha rotina, marcar, itens, relatório do dia), equipe e permissões, indicadores e ranking, Painel do Dono/gerente, histórico de alterações, saúde dos robôs, salvar conhecimento",
    ferramentas: ["rotina_do_dia", "marcar_rotina", "listar_rotinas", "criar_item_rotina", "editar_item_rotina", "excluir_item_rotina", "copiar_rotina", "relatorio_rotina", "rotinas_do_dia", "ler_relatorio_rotina", "aprovar_relatorio_rotina", "listar_equipe", "definir_permissoes", "definir_clientes_da_pessoa", "trocar_papel", "ativar_desativar_pessoa", "meus_indicadores", "painel_do_dono", "resumo_do_gerente", "historico_alteracoes", "saude_robos", "salvar_conhecimento"],
    palavras: /rotina|equipe|permiss|acesso|papel|indicador|ranking|ponto|painel|gerente|desempenho|produtiv|quem (fez|alterou|mexeu)|hist[oó]rico|rob[oô]|sistema|fora do ar|conhecimento|aprend|guard[ae]|lembr[ae]-se|relat[oó]rio do dia|o que falta/i,
    telas: ["/admin/rotinas", "/admin/team", "/admin/painel", "/admin/indicadores", "/admin/sistema"],
  },
  {
    id: "marcas",
    sobre: "marcas e patentes no INPI: carteira, ficha, prazos, avisar cliente no zap",
    ferramentas: ["marcas_carteira", "marca_ficha", "marcas_prazos", "marcas_enviar_zap"],
    palavras: /marca|inpi|patente|revista|registro/i,
    telas: ["/admin/marcas"],
  },
];

const NOMES_AGRUPADOS = new Set([...NUCLEO, ...GRUPOS.flatMap((g) => g.ferramentas)]);
const GRUPO_DE = new Map(GRUPOS.flatMap((g) => g.ferramentas.map((f) => [f, g.id] as const)));

export const CARREGAR: ToolDef = {
  name: "carregar_ferramentas",
  kind: "read",
  label: "Carregou mais ferramentas",
  description: `Liga mais ferramentas para a próxima etapa, quando a que você precisa não está disponível agora. Grupos: ${GRUPOS.map((g) => `${g.id} (${g.sobre})`).join("; ")}.`,
  parameters: {
    type: "object",
    properties: { grupos: { type: "array", items: { type: "string", enum: GRUPOS.map((g) => g.id) } } },
    required: ["grupos"],
  },
  run: async (args) => {
    const ids = (Array.isArray(args.grupos) ? args.grupos : []).map(String).filter((id) => GRUPOS.some((g) => g.id === id));
    return { carregados: ids, aviso: "Ferramentas ligadas; chame a que precisa agora." };
  },
};

const textoDe = (c: Content) => (c.parts ?? []).map((p) => (typeof p.text === "string" ? p.text : "")).join(" ");

/** Grupos que esta rodada precisa, olhando a conversa e a tela. */
export function gruposDaVez(history: Content[], pathname: string): Set<string> {
  const ids = new Set<string>();
  // as duas últimas mensagens escritas pela pessoa (a anterior ajuda no "e desse?")
  const falas = history.filter((c) => c.role === "user" && c.parts?.some((p) => typeof p.text === "string")).slice(-2);
  const texto = falas.map(textoDe).join(" ");
  for (const g of GRUPOS) {
    if (g.palavras?.test(texto)) ids.add(g.id);
    if (g.telas?.some((t) => pathname.startsWith(t))) ids.add(g.id);
  }
  // o que a conversa já usou ou pediu continua ligado
  for (const c of history)
    for (const p of c.parts ?? []) {
      const nome = p.functionCall?.name;
      if (!nome) continue;
      if (nome === CARREGAR.name) for (const id of (p.functionCall?.args?.grupos as unknown[]) ?? []) ids.add(String(id));
      else if (GRUPO_DE.has(nome)) ids.add(GRUPO_DE.get(nome)!);
    }
  return ids;
}

/** Declarações para o Gemini, sempre na mesma ordem (ajuda o cache do Gemini). */
export function declaracoesDaVez(ctx: Ctx, history: Content[], pathname: string) {
  const ids = gruposDaVez(history, pathname);
  const ligadas = new Set([...NUCLEO, ...GRUPOS.filter((g) => ids.has(g.id)).flatMap((g) => g.ferramentas)]);
  const lista = [...TOOLS.filter((t) => ligadas.has(t.name) || !NOMES_AGRUPADOS.has(t.name)), CARREGAR];
  return lista.filter((t) => podeUsar(t, ctx)).map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
}
