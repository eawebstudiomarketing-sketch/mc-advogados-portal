// Regimento Interno (31/10/2026): formato do questionário, igual aos tipos de
// pergunta do Google Forms que o escritório usava (resposta curta, parágrafo,
// múltipla escolha com "Outro", caixas de seleção, data e horário).

export const TIPOS_PERGUNTA = [
  { id: "paragrafo", rotulo: "Parágrafo" },
  { id: "curta", rotulo: "Resposta curta" },
  { id: "multipla", rotulo: "Múltipla escolha" },
  { id: "caixas", rotulo: "Caixas de seleção" },
  { id: "data", rotulo: "Data" },
  { id: "hora", rotulo: "Horário" },
] as const;
export type TipoPergunta = (typeof TIPOS_PERGUNTA)[number]["id"];

export type Pergunta = { id: string; tipo: TipoPergunta; texto: string; ajuda?: string | null; opcoes?: string[]; outro?: boolean; obrigatoria?: boolean };
export type Secao = { id: string; titulo: string; descricao?: string | null; perguntas: Pergunta[] };
/** Resposta: texto, ou lista de opções nas caixas de seleção ("Outro: …" vem como texto na lista). */
export type Resposta = string | string[];
export type Respostas = Record<string, Resposta>;

export type Regimento = {
  id: string;
  client_id: string | null;
  titulo: string;
  descricao: string | null;
  segmento: string | null;
  dados: Record<string, string>;
  secoes: Secao[];
  token: string;
  aceitando: boolean;
  status: "rascunho" | "enviado" | "respondido";
  rascunho_respostas: Respostas;
  respostas: Respostas | null;
  respondido_em: string | null;
  respondente: string | null;
  origem: "portal" | "drive";
  arquivo_origem: string | null;
  created_at: string;
  updated_at: string;
  clients?: { name: string } | null;
};

const novoId = () => Math.random().toString(36).slice(2, 10);

/** Confere e completa o que a IA (ou a edição) devolveu: ids únicos, tipos válidos, opções só onde cabem. */
export function normalizarSecoes(bruto: unknown): Secao[] {
  const tipos = new Set<string>(TIPOS_PERGUNTA.map((t) => t.id));
  const ids = new Set<string>();
  const unico = (id: unknown) => {
    let v = typeof id === "string" && /^[\w-]{2,40}$/.test(id) ? id : novoId();
    while (ids.has(v)) v = novoId();
    ids.add(v);
    return v;
  };
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((s) => s && typeof s === "object")
    .map((s: Record<string, unknown>) => ({
      id: unico(s.id),
      titulo: String(s.titulo ?? "Seção").trim(),
      descricao: s.descricao ? String(s.descricao).trim() : null,
      perguntas: (Array.isArray(s.perguntas) ? s.perguntas : [])
        .filter((p) => p && typeof p === "object" && String((p as Record<string, unknown>).texto ?? "").trim())
        .map((p: Record<string, unknown>) => {
          const tipo = (tipos.has(String(p.tipo)) ? p.tipo : "paragrafo") as TipoPergunta;
          const comOpcoes = tipo === "multipla" || tipo === "caixas";
          const todas = comOpcoes && Array.isArray(p.opcoes) ? p.opcoes.map((o) => String(o).trim()).filter(Boolean) : [];
          // "Outro" escrito como opção vira o campo "Outro:" com texto (como no Google Forms), sem repetir
          const ehOutro = (o: string) => /^outros?\b/i.test(o);
          const opcoes = [...new Set(todas.filter((o) => !ehOutro(o)))];
          if (todas.some(ehOutro)) p.outro = true;
          return {
            id: unico(p.id),
            tipo: comOpcoes && opcoes.length < 2 ? "paragrafo" : tipo,
            texto: String(p.texto).trim(),
            ajuda: p.ajuda ? String(p.ajuda).trim() : null,
            ...(comOpcoes && opcoes.length >= 2 ? { opcoes, outro: Boolean(p.outro) } : {}),
            obrigatoria: Boolean(p.obrigatoria),
          } as Pergunta;
        }),
    }));
}

export const totalPerguntas = (secoes: Secao[]) => secoes.reduce((n, s) => n + s.perguntas.length, 0);

/** Quantas perguntas têm resposta preenchida. */
export function respondidas(secoes: Secao[], r: Respostas | null | undefined): number {
  if (!r) return 0;
  let n = 0;
  for (const s of secoes) for (const p of s.perguntas) {
    const v = r[p.id];
    if (Array.isArray(v) ? v.some((x) => x.trim()) : typeof v === "string" && v.trim()) n++;
  }
  return n;
}
