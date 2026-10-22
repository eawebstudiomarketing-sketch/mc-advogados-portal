// Ficha de Handoff — Comercial → Jurídico (modelo do escritório,
// FICHA_DE_HANDOFF_MC_ADVOGADOS.pdf de 30/07/2026). Mesmas 13 seções e campos.
// Respostas em `client_handoffs.handoff` (jsonb, só a equipe lê): texto → string; múltipla escolha →
// string[]; escolha única / sim-não → string.

export type HandoffField =
  | { id: string; label: string; type: "text" | "date" | "money" | "number"; placeholder?: string; half?: boolean }
  | { id: string; label: string; type: "textarea"; hint?: string; rows?: number }
  | { id: string; label: string; type: "multi"; options: string[]; outro?: boolean }
  | { id: string; label: string; type: "single"; options: string[] }
  | { id: string; label: string; type: "yesno"; detalhe?: { id: string; label: string } };

export type HandoffSection = { id: string; numero: number; titulo: string; descricao?: string; fields: HandoffField[] };

export const HANDOFF_SECTIONS: HandoffSection[] = [
  {
    id: "identificacao",
    numero: 1,
    titulo: "Identificação do Cliente",
    fields: [
      { id: "empresa", label: "Empresa", type: "text" },
      { id: "responsavel", label: "Nome do responsável", type: "text", half: true },
      { id: "cargo", label: "Cargo", type: "text", half: true },
      { id: "telefone", label: "Telefone", type: "text", half: true },
      { id: "email", label: "E-mail", type: "text", half: true },
      { id: "cnpj", label: "CNPJ", type: "text", half: true },
      { id: "segmento", label: "Segmento de atuação", type: "text", half: true },
      { id: "cidade_uf", label: "Cidade/UF", type: "text", half: true },
    ],
  },
  {
    id: "contratacao",
    numero: 2,
    titulo: "Informações da Contratação",
    fields: [
      { id: "data_fechamento", label: "Data do fechamento", type: "date", half: true },
      { id: "consultor", label: "Consultor comercial responsável", type: "text", half: true },
      { id: "mensalidade", label: "Valor da mensalidade", type: "money", half: true },
      { id: "forma_pagamento", label: "Forma de pagamento", type: "text", half: true },
      { id: "inicio_assessoria", label: "Data de início da assessoria", type: "date", half: true },
    ],
  },
  {
    id: "motivo",
    numero: 3,
    titulo: "Motivo da Contratação",
    fields: [
      {
        id: "motivo",
        label: "Por que o cliente decidiu contratar",
        type: "textarea",
        hint: "Com as palavras do cliente.",
        rows: 4,
      },
    ],
  },
  {
    id: "dores",
    numero: 4,
    titulo: "Principais Dores Identificadas",
    descricao: "Demandas apresentadas durante a venda.",
    fields: [
      {
        id: "dores",
        label: "Dores",
        type: "multi",
        outro: true,
        options: [
          "Contratos",
          "Trabalhista",
          "Tributário",
          "Cobrança/Inadimplência",
          "Registro de Marca",
          "Recuperação de Crédito",
          "Consumidor",
          "Societário",
          "Compliance/LGPD",
          "Demandas Judiciais",
        ],
      },
    ],
  },
  {
    id: "objetivos",
    numero: 5,
    titulo: "Objetivos do Cliente",
    descricao: "O que o cliente pretende alcançar com a assessoria.",
    fields: [
      {
        id: "objetivos",
        label: "Objetivos",
        type: "multi",
        outro: true,
        options: [
          "Organizar o jurídico",
          "Reduzir riscos",
          "Padronizar contratos",
          "Estruturar processos internos",
          "Diminuir passivos",
          "Receber suporte consultivo",
          "Crescer com segurança jurídica",
        ],
      },
    ],
  },
  {
    id: "expectativas",
    numero: 6,
    titulo: "Expectativas Alinhadas na Venda",
    fields: [{ id: "expectativas", label: "Entregas apresentadas ao cliente na negociação", type: "textarea", rows: 3 }],
  },
  {
    id: "prioritarias",
    numero: 7,
    titulo: "Demandas Prioritárias",
    fields: [
      {
        id: "urgente",
        label: "Existe alguma situação que exige atenção imediata?",
        type: "yesno",
        detalhe: { id: "urgente_descricao", label: "Descreva a situação" },
      },
      { id: "urgente_prazo", label: "Prazo informado pelo cliente", type: "text" },
    ],
  },
  {
    id: "estrategicas",
    numero: 8,
    titulo: "Informações Estratégicas",
    fields: [
      { id: "funcionarios", label: "Quantidade aproximada de funcionários", type: "number", half: true },
      { id: "tem_rh", label: "Possui setor de RH?", type: "yesno" },
      { id: "tem_contador", label: "Possui contador?", type: "yesno" },
      { id: "contratos_padronizados", label: "Possui contratos padronizados?", type: "yesno" },
      {
        id: "assessoria_anterior",
        label: "Já possui assessoria jurídica anterior?",
        type: "yesno",
        detalhe: { id: "motivo_troca", label: "Por que decidiu trocar?" },
      },
    ],
  },
  {
    id: "objecoes",
    numero: 9,
    titulo: "Objeções Apresentadas Durante a Venda",
    fields: [{ id: "objecoes", label: "Dúvidas ou receios que o cliente demonstrou antes de fechar", type: "textarea", rows: 3 }],
  },
  {
    id: "perfil",
    numero: 10,
    titulo: "Perfil do Cliente",
    descricao: "Percepção do consultor comercial.",
    fields: [
      {
        id: "perfil",
        label: "Perfil",
        type: "multi",
        options: [
          "Muito organizado",
          "Organizado",
          "Pouco organizado",
          "Urgente",
          "Analítico",
          "Conservador",
          "Comunicativo",
          "Objetivo",
          "Necessita acompanhamento próximo",
        ],
      },
      { id: "perfil_obs", label: "Observações", type: "textarea", rows: 2 },
    ],
  },
  {
    id: "compromissos",
    numero: 11,
    titulo: "Compromissos Assumidos pelo Cliente",
    descricao: "Documentos que o cliente se comprometeu a enviar.",
    fields: [
      {
        id: "documentos",
        label: "Documentos",
        type: "multi",
        outro: true,
        options: [
          "Contrato Social",
          "Cartão CNPJ",
          "Alterações Contratuais",
          "Contratos utilizados",
          "Relação de funcionários",
          "Certificado Digital",
        ],
      },
    ],
  },
  {
    id: "observacoes",
    numero: 12,
    titulo: "Observações do Comercial",
    fields: [
      {
        id: "observacoes",
        label: "Informações que facilitem o relacionamento e a condução do onboarding",
        type: "textarea",
        rows: 4,
      },
    ],
  },
  {
    id: "confirmacao",
    numero: 13,
    titulo: "Confirmação do Handoff",
    fields: [
      { id: "conf_consultor", label: "Consultor comercial", type: "text", half: true },
      { id: "conf_data", label: "Data", type: "date", half: true },
      { id: "conf_advogado", label: "Advogado responsável", type: "text", half: true },
      { id: "conf_recebimento", label: "Data de recebimento", type: "date", half: true },
      { id: "status", label: "Status da transição", type: "single", options: ["Recebido", "Em análise", "Onboarding iniciado"] },
    ],
  },
];

/** Ficha de Handoff da PESSOA FÍSICA (comercial → jurídico): o caso, não a empresa. */
export const HANDOFF_SECTIONS_PF: HandoffSection[] = [
  {
    id: "pf_identificacao",
    numero: 1,
    titulo: "Identificação do Cliente",
    fields: [
      { id: "pf_nome", label: "Nome completo", type: "text" },
      { id: "pf_cpf", label: "CPF", type: "text", half: true },
      { id: "pf_rg", label: "RG", type: "text", half: true },
      { id: "pf_nascimento", label: "Data de nascimento", type: "date", half: true },
      { id: "pf_estado_civil", label: "Estado civil", type: "single", options: ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Separado(a)", "Viúvo(a)"] },
      { id: "pf_profissao", label: "Profissão", type: "text", half: true },
      { id: "pf_telefone", label: "Telefone / WhatsApp", type: "text", half: true },
      { id: "pf_email", label: "E-mail", type: "text", half: true },
      { id: "pf_endereco", label: "Endereço completo (rua, nº, bairro, cidade/UF, CEP)", type: "textarea", rows: 2 },
    ],
  },
  {
    id: "pf_contratacao",
    numero: 2,
    titulo: "Informações da Contratação",
    fields: [
      { id: "pf_data_fechamento", label: "Data do fechamento", type: "date", half: true },
      { id: "pf_consultor", label: "Consultor comercial responsável", type: "text", half: true },
      { id: "pf_honorarios_tipo", label: "Tipo de honorários", type: "single", options: ["Fixo", "Êxito", "Fixo + êxito"] },
      { id: "pf_honorarios_valor", label: "Valor fixo", type: "money", half: true },
      { id: "pf_honorarios_exito", label: "Percentual de êxito (%)", type: "text", half: true },
      { id: "pf_forma_pagamento", label: "Forma de pagamento", type: "text", half: true },
    ],
  },
  {
    id: "pf_caso",
    numero: 3,
    titulo: "O Caso",
    fields: [
      {
        id: "pf_area",
        label: "Área",
        type: "single",
        options: ["Consumidor", "Cível", "Trabalhista", "Família", "Previdenciário", "Bancário", "Consórcio", "FIES", "Outra"],
      },
      { id: "pf_parte_contraria", label: "Parte contrária (empresa ou pessoa)", type: "text" },
      { id: "pf_relato", label: "O que aconteceu (relato do cliente)", type: "textarea", rows: 5 },
      { id: "pf_quando", label: "Quando aconteceu", type: "text", half: true },
    ],
  },
  {
    id: "pf_pedido",
    numero: 4,
    titulo: "O que o Cliente Quer",
    fields: [
      { id: "pf_pedido_principal", label: "Pedido principal (indenização, rescisão, revisão, restituição…)", type: "textarea", rows: 3 },
      { id: "pf_resultado_esperado", label: "Resultado que ele espera", type: "textarea", rows: 2 },
    ],
  },
  {
    id: "pf_urgencia",
    numero: 5,
    titulo: "Urgência e Prazos",
    fields: [
      { id: "pf_prazo_correndo", label: "Tem prazo correndo?", type: "yesno", detalhe: { id: "pf_prazo_detalhe", label: "Qual prazo e até quando" } },
      { id: "pf_audiencia", label: "Já tem audiência marcada?", type: "yesno", detalhe: { id: "pf_audiencia_detalhe", label: "Data, hora e local" } },
      { id: "pf_prescricao", label: "Risco de prescrição?", type: "yesno", detalhe: { id: "pf_prescricao_detalhe", label: "Explique" } },
    ],
  },
  {
    id: "pf_provas",
    numero: 6,
    titulo: "Provas e Documentos",
    descricao: "Marque o que o cliente já tem; o que faltar vira pedido de documento.",
    fields: [
      {
        id: "pf_documentos_tem",
        label: "O cliente já tem",
        type: "multi",
        outro: true,
        options: ["RG e CPF", "Comprovante de residência", "Contrato", "Prints de conversas", "Comprovantes de pagamento", "Notas fiscais", "E-mails", "Laudos / atestados", "Fotos / vídeos", "Testemunhas"],
      },
      { id: "pf_documentos_faltam", label: "Documentos que faltam pedir", type: "textarea", rows: 2 },
    ],
  },
  {
    id: "pf_expectativas",
    numero: 7,
    titulo: "Expectativas Alinhadas",
    fields: [{ id: "pf_expectativas", label: "O que foi dito sobre tempo, chances e custos (para ninguém prometer além disso)", type: "textarea", rows: 3 }],
  },
  {
    id: "pf_perfil",
    numero: 8,
    titulo: "Perfil e Observações",
    fields: [
      { id: "pf_contato_preferido", label: "Como prefere ser contatado", type: "single", options: ["WhatsApp", "Ligação", "E-mail"] },
      { id: "pf_horario", label: "Melhor horário", type: "text", half: true },
      { id: "pf_observacoes", label: "Observações do comercial", type: "textarea", rows: 3 },
    ],
  },
  {
    id: "confirmacao",
    numero: 9,
    titulo: "Confirmação do Handoff",
    fields: [
      { id: "conf_consultor", label: "Consultor comercial", type: "text", half: true },
      { id: "conf_data", label: "Data", type: "date", half: true },
      { id: "conf_advogado", label: "Advogado responsável", type: "text", half: true },
      { id: "conf_recebimento", label: "Data de recebimento", type: "date", half: true },
      { id: "status", label: "Status da transição", type: "single", options: ["Recebido", "Em análise", "Caso iniciado"] },
    ],
  },
];

export type TipoPessoa = "PF" | "PJ";

/** Seções da ficha conforme o tipo do cliente. */
export const secoesHandoff = (tipo: TipoPessoa = "PJ") => (tipo === "PF" ? HANDOFF_SECTIONS_PF : HANDOFF_SECTIONS);

/** Ids aceitos na ficha desse tipo (campos + "outro" + detalhe do sim/não). */
export function idsHandoff(tipo: TipoPessoa = "PJ"): Set<string> {
  const ok = new Set<string>();
  for (const s of secoesHandoff(tipo))
    for (const f of s.fields) {
      ok.add(f.id);
      if (f.type === "multi" && f.outro) ok.add(`${f.id}_outro`);
      if (f.type === "yesno" && f.detalhe) ok.add(f.detalhe.id);
    }
  return ok;
}

export type HandoffAnswers = Record<string, string | string[]>;

const vazio = (v: unknown) => v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");

export function handoffPreenchido(h: unknown): boolean {
  if (!h || typeof h !== "object") return false;
  return Object.values(h as HandoffAnswers).some((v) => !vazio(v));
}

/** Quantos campos principais (fora do bloco de confirmação) estão preenchidos. */
export function handoffProgresso(h: HandoffAnswers | null, tipo: TipoPessoa = "PJ"): { feitos: number; total: number } {
  const campos = secoesHandoff(tipo).filter((s) => s.id !== "confirmacao").flatMap((s) => s.fields);
  const feitos = campos.filter((f) => !vazio(h?.[f.id])).length;
  return { feitos, total: campos.length };
}

const dataBR = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso);

/** Texto legível da ficha (para a IA e para resumos). Só o que foi preenchido. */
export function handoffParaTexto(h: HandoffAnswers | null, triagemAntiga?: string | null, tipo?: TipoPessoa): string {
  const blocos: string[] = [];
  // sem tipo informado: descobre pela própria ficha (a PF usa campos pf_*)
  const t = tipo ?? (Object.keys(h ?? {}).some((k) => k.startsWith("pf_")) ? "PF" : "PJ");
  for (const s of secoesHandoff(t)) {
    const linhas: string[] = [];
    for (const f of s.fields) {
      const v = h?.[f.id];
      if (f.type === "multi") {
        const itens = [...((v as string[]) ?? [])];
        const outro = h?.[`${f.id}_outro`];
        if (typeof outro === "string" && outro.trim()) itens.push(`Outro: ${outro.trim()}`);
        if (itens.length) linhas.push(`${f.label}: ${itens.join("; ")}`);
      } else if (f.type === "yesno") {
        if (!vazio(v)) linhas.push(`${f.label} ${v}`);
        const d = f.detalhe ? h?.[f.detalhe.id] : null;
        if (f.detalhe && typeof d === "string" && d.trim()) linhas.push(`${f.detalhe.label}: ${d.trim()}`);
      } else if (!vazio(v)) {
        const t = String(v).trim();
        linhas.push(`${f.label}: ${f.type === "date" ? dataBR(t) : f.type === "money" ? `R$ ${t}` : t}`);
      }
    }
    if (linhas.length) blocos.push(`## ${s.numero}. ${s.titulo}\n${linhas.join("\n")}`);
  }
  if (triagemAntiga?.trim()) blocos.push(`## Anotações anteriores (triagem em texto livre)\n${triagemAntiga.trim()}`);
  return blocos.join("\n\n");
}
