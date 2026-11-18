// Isca 3 (18/11/2026): diagnóstico rápido de riscos trabalhistas da empresa.
// Perguntas de sim/não; cada resposta "de risco" soma pontos pelo peso (1 a 3).
// Textos do escritório: o problema em linguagem simples e o que fazer.

export type Pergunta = {
  id: string;
  texto: string;
  /** resposta que indica risco */
  risco: "sim" | "nao";
  peso: 1 | 2 | 3;
  ponto: string;
  fazer: string;
  /** mostra "Não se aplica" */
  naoSeAplica?: boolean;
};

export const PERGUNTAS: Pergunta[] = [
  {
    id: "carteira",
    texto: "Todos os funcionários têm carteira assinada desde o primeiro dia de trabalho?",
    risco: "nao",
    peso: 3,
    ponto: "Funcionário sem carteira desde o início",
    fazer: "Registrar com a data real de início. Trabalho sem registro gera multa, FGTS e INSS retroativos e é o pedido mais comum em processo.",
  },
  {
    id: "pj",
    texto: "Você tem alguém como PJ ou autônomo que cumpre horário e recebe ordens como funcionário?",
    risco: "sim",
    peso: 3,
    ponto: "PJ ou autônomo trabalhando como funcionário",
    fazer: "Rever o contrato. Com horário, chefe e rotina fixa, a Justiça costuma reconhecer vínculo e cobrar todos os direitos de uma vez.",
  },
  {
    id: "ponto",
    texto: "O horário de entrada e saída é registrado todo dia (ponto)?",
    risco: "nao",
    peso: 2,
    ponto: "Jornada sem controle de ponto",
    fazer: "Implantar controle de ponto (obrigatório acima de 20 funcionários). Sem ele, numa ação vale o horário que o funcionário disser.",
  },
  {
    id: "extras",
    texto: "As horas extras são pagas ou compensadas num banco de horas por escrito?",
    risco: "nao",
    peso: 2,
    ponto: "Horas extras sem pagamento ou acordo escrito",
    fazer: "Pagar com o adicional ou formalizar banco de horas por escrito. Hora extra é a maior conta nas condenações trabalhistas.",
  },
  {
    id: "domingos",
    texto: "Alguém trabalha domingos ou feriados sem folga em outro dia ou pagamento em dobro?",
    risco: "sim",
    peso: 2,
    ponto: "Domingos e feriados sem folga ou pagamento em dobro",
    fazer: "Organizar a escala com folga compensatória ou pagar em dobro. Dá para montar escala que respeite a lei sem perder operação.",
  },
  {
    id: "ferias",
    texto: "As férias são dadas e pagas dentro do prazo (pagamento até 2 dias antes)?",
    risco: "nao",
    peso: 2,
    ponto: "Férias atrasadas ou pagas fora do prazo",
    fazer: "Controlar o vencimento das férias de cada um. Férias fora do prazo são pagas em dobro.",
  },
  {
    id: "contrato",
    texto: "Cada funcionário tem contrato de trabalho escrito e assinado?",
    risco: "nao",
    peso: 1,
    ponto: "Sem contrato de trabalho escrito",
    fazer: "Fazer contrato com função, jornada, local e regras claras. É o que protege a empresa quando surge discussão.",
  },
  {
    id: "regimento",
    texto: "A empresa tem regimento interno (regras da empresa) assinado pelos funcionários?",
    risco: "nao",
    peso: 1,
    ponto: "Sem regimento interno assinado",
    fazer: "Criar regimento interno. Sem regras escritas, fica difícil advertir, suspender ou aplicar justa causa.",
  },
  {
    id: "exames",
    texto: "Os exames médicos (admissional, periódico e demissional) estão em dia?",
    risco: "nao",
    peso: 1,
    ponto: "Exames ocupacionais atrasados",
    fazer: "Manter os exames e o programa de saúde ocupacional em dia. A falta gera multa na fiscalização e enfraquece a defesa em doença ou acidente.",
  },
  {
    id: "adicional",
    texto: "Quem trabalha com risco ou insalubridade recebe o adicional?",
    risco: "nao",
    peso: 2,
    naoSeAplica: true,
    ponto: "Insalubridade ou periculosidade sem adicional",
    fazer: "Fazer o laudo técnico e pagar o adicional quando for o caso. A perícia em processo quase sempre encontra o risco.",
  },
  {
    id: "demissao",
    texto: "Nas demissões, as verbas são pagas em até 10 dias, com tudo documentado?",
    risco: "nao",
    peso: 2,
    ponto: "Demissões fora do prazo ou sem documentação",
    fazer: "Seguir um checklist de demissão. O atraso gera multa de um salário e a falta de papel vira prova contra a empresa.",
  },
  {
    id: "processo",
    texto: "A empresa recebeu algum processo trabalhista nos últimos 2 anos?",
    risco: "sim",
    peso: 2,
    ponto: "Já existe histórico de processo trabalhista",
    fazer: "Revisar o que gerou o processo para não repetir. Ex-funcionários e colegas costumam seguir o mesmo caminho.",
  },
];

export const TAMANHOS = ["1 a 5", "6 a 20", "21 a 50", "Mais de 50"] as const;

export type Resposta = "sim" | "nao" | "na";
export type Diagnostico = { nota: number; nivel: "baixo" | "medio" | "alto"; pontos: Pergunta[] };

/** nota 0–100 (quanto maior, maior o risco) e os pontos de risco, do mais grave para o menos. */
export function diagnosticar(r: Record<string, Resposta>): Diagnostico {
  let soma = 0;
  let max = 0;
  const pontos: Pergunta[] = [];
  for (const p of PERGUNTAS) {
    if (r[p.id] === "na") continue;
    max += p.peso;
    if (r[p.id] === p.risco) {
      soma += p.peso;
      pontos.push(p);
    }
  }
  const nota = max ? Math.round((soma / max) * 100) : 0;
  pontos.sort((a, b) => b.peso - a.peso);
  const graves = pontos.some((p) => p.peso === 3);
  const nivel = nota >= 45 || (graves && nota >= 25) ? "alto" : nota >= 15 || graves ? "medio" : "baixo";
  return { nota, nivel, pontos };
}
