// Estágios da carteira (bloco "Marcas por estágio" da Principal), a partir da
// situação do processo escrita pelo INPI. Mesmos grupos do Marca Acompanhada.

export const ESTAGIOS = [
  { id: "registrado", rotulo: "Registrado", cor: "bg-status-success", encerrado: false },
  { id: "exame", rotulo: "Em exame", cor: "bg-status-info", encerrado: false },
  { id: "concessao", rotulo: "Aguardando concessão", cor: "bg-gold", encerrado: false },
  { id: "recurso", rotulo: "Em recurso", cor: "bg-status-pending", encerrado: false },
  { id: "sobrestado", rotulo: "Sobrestado", cor: "bg-roxo", encerrado: false },
  { id: "indeferido", rotulo: "Indeferido", cor: "bg-status-danger", encerrado: true },
  { id: "arquivado", rotulo: "Arquivado", cor: "bg-border-strong", encerrado: true },
  { id: "extinto", rotulo: "Extinto", cor: "bg-border-strong", encerrado: true },
] as const;
export type Estagio = (typeof ESTAGIOS)[number]["id"];

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Estágio a partir da situação do INPI (null = sem situação informada). */
export function estagioDaSituacao(situacao: string | null | undefined): Estagio | null {
  if (!situacao?.trim()) return null;
  const s = sem(situacao);
  if (s.includes("extint") || s.includes("caducidade") || s.includes("nulidade declarada")) return "extinto";
  if (s.includes("arquivad")) return "arquivado";
  if (s.includes("recurso")) return "recurso";
  if (s.includes("indeferid")) return "indeferido";
  if (s.includes("sobrest")) return "sobrestado";
  if (s.includes("em vigor") || s.includes("registro de marca") || s.includes("concedid") || s.includes("patente em vigor")) return "registrado";
  if (s.includes("concessao") || s.includes("deferid")) return "concessao";
  return "exame";
}
