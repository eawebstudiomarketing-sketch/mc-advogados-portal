// Rotinas v2 (30/10/2026): o relatório do dia. Tipos e regras que servem ao servidor e à tela.

export const SECOES = ["pessoal", "equipe_geral", "equipe_pessoa"] as const;
export type Secao = (typeof SECOES)[number];
export const SECAO_ROTULO: Record<Secao, { titulo: string; ajuda: string }> = {
  pessoal: { titulo: "Sobre você", ajuda: "Perguntas sobre o seu dia." },
  equipe_geral: { titulo: "Sobre a equipe", ajuda: "Perguntas gerais, sobre a equipe como um todo." },
  equipe_pessoa: { titulo: "Sobre cada pessoa", ajuda: "A mesma pergunta, uma vez para cada integrante." },
};

export const TIPOS = ["texto_curto", "texto_longo", "escolha", "multipla", "sim_nao", "nota", "numero"] as const;
export type TipoPergunta = (typeof TIPOS)[number];
export const TIPO_ROTULO: Record<TipoPergunta, string> = {
  texto_curto: "Texto curto",
  texto_longo: "Texto longo",
  escolha: "Escolha uma opção",
  multipla: "Várias opções",
  sim_nao: "Sim ou não",
  nota: "Nota de 0 a 10",
  numero: "Número",
};

export type Pergunta = {
  id: string;
  modelo_id: string;
  secao: Secao;
  ordem: number;
  texto: string;
  tipo: TipoPergunta;
  opcoes: string[];
  obrigatoria: boolean;
  ativa: boolean;
};
export type Modelo = { id: string; nome: string; ativo: boolean; perguntas: Pergunta[] };

/** Resposta: texto, número ou lista (várias opções). */
export type Valor = string | number | string[];
/** Chave da resposta: `${perguntaId}` (pessoal e equipe geral) ou `${perguntaId}:${responsavelId}` (por pessoa). */
export const chaveResposta = (perguntaId: string, sobre?: string | null) => (sobre ? `${perguntaId}:${sobre}` : perguntaId);

export type DemandaVencida = { id: string; titulo: string; cliente: string | null; prazo: string; diasAtraso: number };
export type PessoaEquipe = { id: string; nome: string };

/** Cópia das perguntas no momento do envio: editar o modelo depois não mexe no relatório já enviado. */
export type PerguntaSnap = Pick<Pergunta, "id" | "secao" | "texto" | "tipo" | "opcoes" | "obrigatoria">;
export type Snapshot = { perguntas: PerguntaSnap[]; equipe: PessoaEquipe[]; demandas: DemandaVencida[] };

export type RelatorioDoDia = {
  id: string | null;
  responsavel_id: string;
  dia: string;
  modelo_id: string | null;
  status: "rascunho" | "enviado";
  respostas: Record<string, Valor>;
  justificativas: Record<string, string>;
  snapshot: Snapshot | null;
  enviado_em: string | null;
};

const vazio = (v: Valor | undefined) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

/** O que falta para poder enviar (lista de avisos em português; vazia = pode enviar). */
export function faltaParaEnviar(args: {
  perguntas: Pick<Pergunta, "id" | "secao" | "texto" | "obrigatoria" | "ativa">[];
  equipe: PessoaEquipe[];
  respostas: Record<string, Valor>;
  demandas: DemandaVencida[];
  justificativas: Record<string, string>;
}): string[] {
  const avisos: string[] = [];
  let semResposta = 0;
  for (const p of args.perguntas) {
    if (!p.ativa || !p.obrigatoria) continue;
    if (p.secao === "equipe_pessoa") {
      for (const pessoa of args.equipe) if (vazio(args.respostas[chaveResposta(p.id, pessoa.id)])) semResposta++;
    } else if (vazio(args.respostas[chaveResposta(p.id)])) semResposta++;
  }
  if (semResposta) avisos.push(`${semResposta} ${semResposta === 1 ? "pergunta obrigatória sem resposta" : "perguntas obrigatórias sem resposta"}`);
  const semJust = args.demandas.filter((d) => (args.justificativas[d.id] ?? "").trim().length < 5).length;
  if (semJust) avisos.push(`${semJust} ${semJust === 1 ? "demanda vencida sem justificativa" : "demandas vencidas sem justificativa"}`);
  return avisos;
}
