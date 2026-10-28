// Formato das atas (roda no navegador e no servidor). O texto da ata é
// guardado em linhas simples, fáceis de editar:
//   # Título da seção            (com "(uso interno do escritório)" = interna)
//   ## Subseção
//   • item [00:12:40]            (o minuto aponta pra gravação; some no PDF)
//   1. Item numerado
//   Rótulo: valor                (ex.: "Prioridade: Alta")
//   qualquer outra linha = parágrafo
// A seção "1. Identificação da reunião" não fica no texto: sai dos dados da
// ata (cliente, data, local, participantes), sempre igual.

export type TipoAta = "onboarding" | "reuniao_cliente" | "interna";
export type PapelParticipante = "escritorio" | "cliente" | "testemunha" | "outro";
export type Participante = { nome: string; papel: PapelParticipante; profile_id?: string | null; telefone?: string | null; email?: string | null; cargo?: string | null };
export type Marcacao = { seg: number; tipo: "importante" | "decisao" };
export type Alerta = { tipo: "nao_dito" | "faltou"; texto: string; motivo: string; minuto?: string | null };
export type StatusAta = "gravando" | "processando" | "transcrita" | "gerando" | "rascunho" | "erro" | "aguardando" | "aprovada" | "assinada";

export const STATUS_ROTULO: Record<StatusAta, string> = {
  gravando: "Gravando",
  processando: "Transcrevendo",
  transcrita: "Reunião pronta",
  gerando: "Gerando a ata",
  rascunho: "Rascunho",
  erro: "Deu erro",
  aguardando: "Aguardando assinaturas",
  aprovada: "Aprovada",
  assinada: "Assinada",
};

export const TIPOS_ATA: Record<TipoAta, { rotulo: string; titulo: string; descricao: string; secoes: string; assinaCliente: boolean }> = {
  onboarding: {
    rotulo: "Onboarding",
    titulo: "Ata de reunião de onboarding",
    descricao: "Primeira reunião com o cliente: contexto, objetivos, diagnóstico e pendências.",
    assinaCliente: true,
    secoes: `# Contexto da empresa
(história, ramo, porte, faturamento e colaboradores citados, quem decide, pontos de contato)
# Objetivos do cliente
# Diagnóstico inicial
(use subseções "## Contratos e endividamento", "## Tributário", "## Trabalhista", "## Regulatório", "## Societário", "## Passivos" — só as que tiverem conteúdo)
# Expectativas e alinhamentos
(subseções "## Expectativas do cliente" e "## Pontos a alinhar")
# Processos e demandas já existentes
(para cada um, o que solicitar ao cliente para avaliar habilitação/substabelecimento e cadastro no sistema processual)
# Providências acordadas
# Informações e documentos pendentes
# Próximos passos sugeridos (uso interno do escritório)
(itens numerados "1. Nome curto", seguidos das linhas "Prioridade: Alta|Média|Baixa", "Ação sugerida: …", "Motivo: …", "Próximo passo: …")`,
  },
  reuniao_cliente: {
    rotulo: "Reunião com cliente",
    titulo: "Ata de reunião",
    descricao: "Acompanhamento, alinhamento ou entrega com o cliente.",
    assinaCliente: true,
    secoes: `# Pauta
# Assuntos tratados
(uma subseção "## Assunto" para cada tema, com o que foi dito)
# Decisões
# Providências acordadas
(• tarefa — responsável — prazo, só com o que foi dito)
# Informações e documentos pendentes
# Próximos passos sugeridos (uso interno do escritório)
(itens numerados "1. Nome curto", seguidos das linhas "Prioridade: Alta|Média|Baixa", "Ação sugerida: …", "Motivo: …", "Próximo passo: …")`,
  },
  interna: {
    rotulo: "Reunião interna",
    titulo: "Ata de reunião interna",
    descricao: "Reunião da equipe. Não vai para o cliente assinar.",
    assinaCliente: false,
    secoes: `# Pauta
# Discussão
(uma subseção "## Tema" para cada assunto)
# Decisões
# Encaminhamentos
(• tarefa — responsável — prazo, só com o que foi dito)`,
  },
};

export const PAPEL_ROTULO: Record<PapelParticipante, string> = { escritorio: "Escritório", cliente: "Cliente", testemunha: "Testemunha", outro: "Convidado" };

/* ───────── texto → blocos ───────── */

export type BlocoAta =
  | { tipo: "secao"; texto: string; numero: number; interna: boolean }
  | { tipo: "subsecao"; texto: string }
  | { tipo: "item"; texto: string; minuto: string | null }
  | { tipo: "numerado"; texto: string; minuto: string | null }
  | { tipo: "campo"; rotulo: string; texto: string; minuto: string | null }
  | { tipo: "paragrafo"; texto: string; minuto: string | null };

// o tempo vai no fim da linha (às vezes a IA põe depois do ponto ou repete no meio)
const MINUTO = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/;
const MINUTOS = /\s*\[\d{1,2}:\d{2}(?::\d{2})?\]/g;
const ehInterna = (titulo: string) => /uso interno/i.test(titulo);

function semMinuto(linha: string): { texto: string; minuto: string | null } {
  const m = linha.match(MINUTO);
  const texto = linha.replace(MINUTOS, "").replace(/\s+([.;,])/g, "$1").trim();
  return { texto, minuto: m ? (m[1].length <= 5 ? `00:${m[1].padStart(5, "0")}` : m[1].padStart(8, "0")) : null };
}

/** Lê o texto da ata. A numeração das seções começa em 2 (a 1 é a identificação). */
export function blocosDaAta(texto: string | null): BlocoAta[] {
  const out: BlocoAta[] = [];
  let numero = 1;
  for (const cru of (texto ?? "").split(/\r?\n/)) {
    const linha = cru.trim();
    if (!linha) continue;
    if (/^#\s/.test(linha) && !/^##/.test(linha)) {
      const t = linha.replace(/^#\s*/, "").replace(/^\d+\.\s*/, "");
      out.push({ tipo: "secao", texto: t, numero: ++numero, interna: ehInterna(t) });
    } else if (/^##\s/.test(linha)) out.push({ tipo: "subsecao", texto: linha.replace(/^##\s*/, "") });
    else if (/^[•\-*]\s/.test(linha)) out.push({ tipo: "item", ...semMinuto(linha.replace(/^[•\-*]\s*/, "")) });
    else if (/^\d+[.)]\s/.test(linha)) out.push({ tipo: "numerado", ...semMinuto(linha) });
    else {
      const campo = linha.match(/^([A-ZÀ-Ú][\wÀ-ú ]{1,28}):\s+(.+)$/);
      if (campo) out.push({ tipo: "campo", rotulo: campo[1], ...semMinuto(campo[2]) });
      else out.push({ tipo: "paragrafo", ...semMinuto(linha) });
    }
  }
  return out;
}

/** Tira as seções internas (versão que vai para o cliente assinar), renumerando. */
export function blocosParaCliente(blocos: BlocoAta[]): BlocoAta[] {
  const out: BlocoAta[] = [];
  let dentroInterna = false;
  let numero = 1;
  for (const b of blocos) {
    if (b.tipo === "secao") {
      dentroInterna = b.interna;
      if (!dentroInterna) out.push({ ...b, numero: ++numero });
      continue;
    }
    if (!dentroInterna) out.push(b);
  }
  return out;
}

export const temParteInterna = (texto: string | null) => blocosDaAta(texto).some((b) => b.tipo === "secao" && b.interna);

/* ───────── identificação ───────── */

export const dataHoraBr = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às");
export const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });

export type DadosAta = {
  tipo: TipoAta;
  titulo: string;
  data_reuniao: string;
  local: string | null;
  pauta?: string | null;
  participantes: Participante[];
  cliente?: string | null;
};

/** Linhas "Rótulo: valor" da seção 1. */
export function identificacao(a: DadosAta): { rotulo: string; texto: string }[] {
  const linhas = [{ rotulo: "Escritório", texto: "MC ADVOGADOS" }];
  if (a.cliente) linhas.push({ rotulo: a.tipo === "onboarding" ? "Empresa cliente" : "Cliente", texto: a.cliente });
  linhas.push({ rotulo: "Data da reunião", texto: dataHoraBr(a.data_reuniao) });
  if (a.local) linhas.push({ rotulo: "Local", texto: a.local });
  const pessoas = a.participantes.map((p) => `${p.nome}${p.cargo ? ` (${p.cargo})` : ""} — ${PAPEL_ROTULO[p.papel]}`);
  if (pessoas.length) linhas.push({ rotulo: "Participantes", texto: pessoas.join("; ") });
  return linhas;
}

export const NOTA_INTERNA = "Sugestões geradas para revisão do advogado. Não representam compromissos assumidos perante o cliente.";

/** "00:12:40" → segundos. */
export const segundos = (hms: string) => hms.split(":").map(Number).reduce((t, n) => t * 60 + n, 0);
export const hms = (s: number) => [Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.floor(s % 60)].map((n) => String(n).padStart(2, "0")).join(":");

/** Texto simples da ata inteira (copiar, assistente). */
export function textoCompleto(a: DadosAta, texto: string | null, { cliente = false } = {}): string {
  const blocos = cliente ? blocosParaCliente(blocosDaAta(texto)) : blocosDaAta(texto);
  const linhas = [`MC ADVOGADOS`, a.titulo, "", "1. Identificação da reunião", ...identificacao(a).map((l) => `${l.rotulo}: ${l.texto}`)];
  for (const b of blocos) {
    if (b.tipo === "secao") linhas.push("", `${b.numero}. ${b.texto}`);
    else if (b.tipo === "subsecao") linhas.push(b.texto);
    else if (b.tipo === "item") linhas.push(`• ${b.texto}`);
    else if (b.tipo === "campo") linhas.push(`${b.rotulo}: ${b.texto}`);
    else linhas.push(b.texto);
  }
  return linhas.join("\n");
}
