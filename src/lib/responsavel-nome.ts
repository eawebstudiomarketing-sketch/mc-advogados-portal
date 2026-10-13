// Nome de quem responde pela atividade: o responsável (tabela responsaveis) ou,
// nas atividades antigas sem ele, o autor (profiles). Serve no cliente e no servidor.
export const nomeResponsavel = (a: { responsaveis?: { nome: string } | null; profiles?: { full_name: string } | null }) =>
  a.responsaveis?.nome ?? a.profiles?.full_name ?? null;
