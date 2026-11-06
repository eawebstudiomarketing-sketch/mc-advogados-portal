// CRM / Comercial (06/11/2026): tipos que valem no navegador e no servidor.
// O formulário segue o desenho do Yay! Forms que o escritório já usava: uma
// pergunta por tela, imagem no alto, botão embaixo, barra de progresso.

export type CampoTipo = "texto" | "texto_longo" | "telefone" | "email" | "numero" | "sim_nao" | "escolha" | "multipla";

export const CAMPO_ROTULO: Record<CampoTipo, string> = {
  texto: "Texto curto",
  texto_longo: "Texto longo",
  telefone: "WhatsApp / telefone",
  email: "E-mail",
  numero: "Número",
  sim_nao: "Sim ou não",
  escolha: "Escolha uma opção",
  multipla: "Várias opções",
};

/** Para qual dado do lead a resposta vai (o resto fica em "respostas"). */
export type CampoMapa = "nome" | "telefone" | "email" | "empresa" | null;

export type Pulo = { se: string; para: string }; // resposta → id do campo (ou "fim")

export type Campo = {
  id: string;
  tipo: CampoTipo;
  titulo: string;
  descricao?: string;
  obrigatorio?: boolean;
  imagem?: string | null;
  opcoes?: string[];
  mapear?: CampoMapa;
  pulos?: Pulo[];
};

export type Tela = { titulo: string; descricao?: string; imagem?: string | null; botao?: string; link?: string };

export type Tema = { fundo: string; pagina: string; texto: string; resposta: string; botaoFundo: string; botaoTexto: string };

export type FormConfig = { tema: Tema; boasVindas: Tela; final: Tela; campos: Campo[] };

export const TEMA_PADRAO: Tema = { fundo: "#061021", pagina: "#000000", texto: "#FFFFFF", resposta: "#CCCCCC", botaoFundo: "#FFFFFF", botaoTexto: "#000000" };

export const CONFIG_VAZIA: FormConfig = {
  tema: TEMA_PADRAO,
  boasVindas: { titulo: "Olá, seja bem-vindo(a)", descricao: "", botao: "Começar" },
  final: { titulo: "Obrigado!", descricao: "Recebemos suas respostas.", botao: "QUERO ORIENTAÇÃO", link: "" },
  campos: [],
};

export type Formulario = {
  id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  config: FormConfig;
  responsavel_padrao: string | null;
  created_at: string;
  updated_at: string;
};

export type EtapaTipo = "aberta" | "ganho" | "perdido";
export type Etapa = { id: string; nome: string; ordem: number; cor: string; tipo: EtapaTipo };

export type Resposta = { pergunta: string; resposta: string };

export type Lead = {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  empresa: string | null;
  origem: string;
  status: string;
  etapa_id: string | null;
  formulario_id: string | null;
  responsavel: string | null;
  client_id: string | null;
  chat_jid: string | null;
  respostas: Resposta[];
  utm: Record<string, string>;
  rastreio: Record<string, string>;
  valor: number | null;
  motivo_perda: string | null;
  proximo_contato: string | null;
  primeiro_contato_em: string | null;
  ganho_em: string | null;
  perdido_em: string | null;
  tags: string[];
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadEvento = { id: string; lead_id: string; tipo: string; texto: string | null; dados: Record<string, unknown>; autor: string | null; created_at: string };

/** Cor da etapa → classes do portal. */
export const COR_ETAPA: Record<string, { ponto: string; chip: string }> = {
  info: { ponto: "bg-status-info", chip: "bg-status-info-bg text-status-info" },
  navy: { ponto: "bg-navy", chip: "bg-surface-2 text-foreground" },
  pending: { ponto: "bg-status-pending", chip: "bg-status-pending-bg text-status-pending" },
  gold: { ponto: "bg-gold", chip: "bg-gold-soft text-gold-ink" },
  success: { ponto: "bg-status-success", chip: "bg-status-success-bg text-status-success" },
  danger: { ponto: "bg-status-danger", chip: "bg-status-danger-bg text-status-danger" },
};
export const CORES = Object.keys(COR_ETAPA);

export const MOTIVOS_PERDA = ["Não respondeu", "Achou caro", "Fechou com outro escritório", "Não tem o perfil (fora da área)", "Desistiu / não é o momento", "Contato errado / spam", "Outro"];

/** Só os números; com DDI 55 quando vier com DDD. */
export function telefoneLimpo(t: string | null | undefined): string {
  const d = String(t ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

/** (73) 99846-9554 */
export function telefoneBonito(t: string | null | undefined): string {
  const d = telefoneLimpo(t).replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ?? "";
}

export const primeiroNome = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] ?? "";

/** Link do WhatsApp com a primeira mensagem já escrita. */
export function linkZap(telefone: string | null | undefined, texto?: string): string {
  const t = telefoneLimpo(telefone);
  return `https://wa.me/${t}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

/** Próxima tela depois de responder `campo` (pulos), ou a seguinte na ordem. -1 = tela final. */
export function proximoIndice(campos: Campo[], i: number, resposta: string | string[] | undefined): number {
  const c = campos[i];
  const r = Array.isArray(resposta) ? resposta : resposta ? [resposta] : [];
  const pulo = c?.pulos?.find((p) => r.some((x) => x.toLowerCase() === p.se.toLowerCase()));
  if (pulo) {
    if (pulo.para === "fim") return -1;
    const j = campos.findIndex((x) => x.id === pulo.para);
    if (j > i) return j;
  }
  return i + 1 < campos.length ? i + 1 : -1;
}

export const novoId = () => Math.random().toString(36).slice(2, 10);
