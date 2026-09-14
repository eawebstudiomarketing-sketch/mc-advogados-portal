// Conteúdo fixo do onboarding de clientes — mesma estrutura e mesmo texto da
// skill "Onboarding da Assessoria Jurídica" (HTML autocontido) já usada pelo
// escritório fora do portal. Perguntas/ações não mudam por cliente; só as
// respostas (guardadas em `onboardings.answers`, chave = questionId).

export type OnboardingQuestion = { id: string; text: string };

export type OnboardingStage = {
  id: string;
  number: number;
  icon: string;
  name: string;
  questions: OnboardingQuestion[];
  actions: string[];
};

export const ONBOARDING_STAGES: OnboardingStage[] = [
  {
    id: "e1",
    number: 1,
    icon: "🤝",
    name: "Apresentação e Alinhamento Inicial",
    questions: [
      { id: "e1q1", text: "Quem é você e qual sua função na empresa?" },
      { id: "e1q2", text: "Como conheceu o escritório?" },
      { id: "e1q3", text: "Quais são suas expectativas com a assessoria?" },
      { id: "e1q4", text: "O que te levou a contratar nossos serviços agora?" },
      { id: "e1q5", text: "Qual sua maior preocupação jurídica hoje?" },
    ],
    actions: [
      "Apresentar a equipe e o modelo de atendimento.",
      "Explicar o funcionamento da assessoria.",
      "Alinhar expectativas e objetivos iniciais.",
      "Esclarecer canais de comunicação e prazos.",
      "Registrar todas as informações na Astra.",
    ],
  },
  {
    id: "e2",
    number: 2,
    icon: "🏢",
    name: "Conhecendo a Empresa",
    questions: [
      { id: "e2q1", text: "Qual o ramo de atuação da empresa?" },
      { id: "e2q2", text: "Quando foi fundada e qual o estágio atual do negócio?" },
      { id: "e2q3", text: "Qual o porte da empresa (faturamento e nº de colaboradores)?" },
      { id: "e2q4", text: "Quais são os principais produtos/serviços oferecidos?" },
      { id: "e2q5", text: "Quem são seus principais clientes e fornecedores?" },
      { id: "e2q6", text: "Em quais estados a empresa atua?" },
    ],
    actions: [
      "Entender o negócio, mercado e estrutura operacional.",
      "Mapear áreas críticas e setores envolvidos.",
      "Solicitar materiais institucionais (site, apresentação, etc.)",
      "Registrar todas as informações na Astra.",
    ],
  },
  {
    id: "e3",
    number: 3,
    icon: "🎯",
    name: "Objetivos e Planos",
    questions: [
      { id: "e3q1", text: "Quais são os objetivos da empresa para os próximos 12 meses?" },
      { id: "e3q2", text: "Existe algum projeto de expansão ou mudança relevante?" },
      { id: "e3q3", text: "Há intenção de captação de investimento, venda ou fusão?" },
      { id: "e3q4", text: "Quais são os principais desafios para crescer?" },
      { id: "e3q5", text: "Como a assessoria jurídica pode contribuir com esses objetivos?" },
    ],
    actions: [
      "Compreender o planejamento estratégico.",
      "Identificar como o jurídico pode apoiar o crescimento.",
      "Mapear oportunidades de atuação preventiva.",
      "Registrar todas as informações na Astra.",
    ],
  },
  {
    id: "e4",
    number: 4,
    icon: "⚠️",
    name: "Riscos e Problemas Atuais",
    questions: [
      { id: "e4q1", text: "Quais são os principais riscos jurídicos que a empresa enfrenta?" },
      { id: "e4q2", text: "Existe alguma demanda judicial em andamento?" },
      { id: "e4q3", text: "Há fiscalizações, notificações ou investigações?" },
      { id: "e4q4", text: "Quais contratos são mais importantes para o negócio?" },
      { id: "e4q5", text: "Existe alguma área que se sente mais dúvida ou insegurança?" },
      { id: "e4q6", text: "Há passivos trabalhistas, tributários ou regulatórios?" },
    ],
    actions: [
      "Levantar riscos e contingências.",
      "Priorizar os temas mais sensíveis.",
      "Solicitar documentos e informações necessárias.",
      "Iniciar elaboração do Mapa de Riscos.",
    ],
  },
  {
    id: "e5",
    number: 5,
    icon: "📋",
    name: "Documentos e Informações",
    questions: [
      { id: "e5q1", text: "Enviar checklist de documentos específicos do negócio." },
      { id: "e5q2", text: "Quais documentos estão disponíveis atualmente?" },
      { id: "e5q3", text: "Quem é o responsável por fornecer cada documento?" },
      { id: "e5q4", text: "Há contratos padronizados pela empresa?" },
      { id: "e5q5", text: "Qual o sistema ou ferramenta utilizada internamente?" },
    ],
    actions: [
      "Coletar e organizar documentos na Astra.",
      "Validar pendências e prazos para envio.",
      "Solicitar acesso a sistemas (se necessário).",
      "Confirmar recebimento e arquivamento.",
    ],
  },
  {
    id: "e6",
    number: 6,
    icon: "👥",
    name: "Estrutura Interna",
    questions: [
      { id: "e6q1", text: "Quem toma as decisões na empresa?" },
      { id: "e6q2", text: "Existe um jurídico interno? Quem é o responsável?" },
      { id: "e6q3", text: "Como é o fluxo de aprovação de contratos e decisões?" },
      { id: "e6q4", text: "Quais são os principais departamentos envolvidos?" },
      { id: "e6q5", text: "Quem são os pontos de contato da empresa conosco?" },
    ],
    actions: [
      "Mapear responsáveis e alçadas.",
      "Definir fluxos de comunicação interna.",
      "Cadastrar contatos no Astra.",
      "Estabelecer rotina de alinhamentos.",
    ],
  },
  {
    id: "e7",
    number: 7,
    icon: "✓",
    name: "Próximos Passos",
    questions: [
      { id: "e7q1", text: "Com base no que conversamos, qual deve ser o foco inicial?" },
      { id: "e7q2", text: "Qual a prioridade número 1 para os próximos 30 dias?" },
      { id: "e7q3", text: "Quando podemos agendar nossa próxima reunião?" },
      { id: "e7q4", text: "Há algo mais que gostaria de compartilhar?" },
    ],
    actions: [
      "Apresentar plano inicial de ação.",
      "Definir entregas e prazos.",
      "Agendar próxima reunião de alinhamento.",
      "Finalizar registro completo no Astra.",
    ],
  },
];

export const ONBOARDING_OBJECTIVE =
  "Garantir uma implantação completa, entendendo profundamente a empresa, seus riscos e objetivos para oferecer uma assessoria jurídica estratégica, preventiva e personalizada.";

export const ONBOARDING_INFO_ESSENCIAIS = [
  "Registre todas as informações no Astra em tempo real.",
  "Mantenha o cliente informado sobre cada etapa.",
  "Entregue valor rápido, diagnóstico, orientação ou alerta.",
  "Alinhe expectativas constantemente.",
  "Onboarding concluído somente após reunião de alinhamento e entrega do plano inicial.",
];

export const ONBOARDING_CHECKLIST_CONCLUSAO = [
  "Reunião de onboarding realizada",
  "Informações e documentos coletados",
  "Mapa de Riscos iniciado",
  "Plano Inicial de ação elaborado",
  "Cliente sente os canais e fluxo de atendimento",
  "Registro completo no Astra",
];

export const ONBOARDING_REGRA_OURO = {
  text: "Nosso objetivo é que o cliente perceba valor antes mesmo da primeira demanda.",
  destaque: "PREVENIR É MELHOR QUE LITIGAR.",
};

export const MC_LETTERHEAD = {
  nome: "MAURÍCIO CARDOSO",
  subtitulo: "ADVOCACIA",
  telefone: "(73) 9923-5954",
  email: "mauriciocardosof.adv@gmail.com",
  endereco: "São Lourenço, Teixeira de Freitas-BA",
  cep: "CEP 45.992-090",
  oab: "OAB-BA 76.770",
};

export const MC_FOOTER_VALORES = [
  { icon: "⚖️", text: "RELACIONAMENTO E ESTRATÉGIA" },
  { icon: "📊", text: "GESTÃO JURÍDICA E GESTÃO DO NEGÓCIO" },
  { icon: "😊", text: "CLIENTE BEM ACOMPANHADO, CLIENTE FIDELIZADO" },
];

export type OnboardingAnswers = Record<string, string>;
