// Tipos de aviso que o sistema manda sozinho para a equipe e que cada pessoa pode ligar/desligar
// (Minha conta › Notificações). Só entram aqui os avisos em que o desligar de fato vale.

export type Canal = "zap" | "email";
export type Formato = "completa" | "resumida" | "titulo";

export const FORMATOS: Record<Formato, { rotulo: string; ajuda: string }> = {
  completa: { rotulo: "Completa", ajuda: "Todos os detalhes." },
  resumida: { rotulo: "Resumida", ajuda: "Só o essencial, em poucas linhas." },
  titulo: { rotulo: "Só o título", ajuda: "Uma linha avisando, com o link para abrir no portal." },
};

export type TipoAviso = {
  id: string;
  rotulo: string;
  descricao: string;
  canais: Canal[];
  /** só o admin máximo recebe esse aviso (então só ele vê a opção) */
  soSuper?: boolean;
};

export const TIPOS_AVISO: TipoAviso[] = [
  { id: "rotina_8h", rotulo: "Rotina das 8h", descricao: "Sua agenda e as tarefas fixas do dia, todo dia útil de manhã.", canais: ["zap"] },
  { id: "atividades_atrasadas", rotulo: "Atividades atrasadas e a vencer", descricao: "Aviso com as atividades suas que vencem ou já passaram do prazo.", canais: ["email"] },
  { id: "avisos_do_gerente", rotulo: "Alertas do gerente", descricao: "Avisos que o Painel do Dono manda a você sobre atrasos e pendências.", canais: ["zap"] },
  { id: "resumos_painel", rotulo: "Resumo e sugestões do Painel", descricao: "O resumo do dia e as sugestões do gerente do Painel do Dono.", canais: ["zap"], soSuper: true },
  { id: "contratos", rotulo: "Contratos chegando ao fim", descricao: "Aviso de contrato de cliente perto de vencer.", canais: ["zap", "email"], soSuper: true },
  { id: "alertas_sistema", rotulo: "Alertas do sistema", descricao: "Banco de dados cheio, robô de andamentos fora do ar e problemas parecidos.", canais: ["zap", "email"], soSuper: true },
];

export const tipoPorId = (id: string) => TIPOS_AVISO.find((t) => t.id === id);

/** Aplica o formato escolhido a uma mensagem de várias linhas (a 1ª linha é o título). */
export function aplicarFormato(texto: string, formato: Formato, linkFinal?: string): string {
  if (formato === "completa") return texto;
  const linhas = texto.split("\n").filter((l) => l.trim());
  const base = formato === "titulo" ? linhas.slice(0, 1) : linhas.slice(0, 4);
  return [...base, ...(linkFinal ? ["", linkFinal] : [])].join("\n");
}
