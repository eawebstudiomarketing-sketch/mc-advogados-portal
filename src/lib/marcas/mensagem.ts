// Mensagem do WhatsApp das Marcas (modelo por status + variáveis). Sem nada do
// servidor: a aba WhatsApp usa no navegador para a mensagem mudar na hora
// em que a advogada troca o status; o envio usa no servidor.

const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export type Modelo = { id: string; status: string; texto: string; ordem: number; ativo: boolean };
export type ConfigEnvio = { envio_modo: "manual" | "automatico"; envio_dia: number; ultimo_envio_auto: string | null };

export type MarcaZap = {
  id: string;
  processo: string;
  nome: string | null;
  apelido: string | null;
  classe: string | null;
  situacao: string | null;
  status_mensagem: string | null;
  ultimo_despacho: string | null;
  ultimo_despacho_data: string | null;
  previsao: string | null;
  contato_nome: string | null;
  contato_numero: string | null;
  client_id: string | null;
  avisar_cliente: boolean;
  clients?: { name: string } | null;
  proximo_prazo?: string | null;
  ultimo_envio?: string | null;
};

/** Status usado na mensagem: o que a advogada escolheu ou a situação do INPI. */
export const statusDaMensagem = (m: Pick<MarcaZap, "status_mensagem" | "situacao">) => m.status_mensagem?.trim() || m.situacao?.trim() || "Padrão";

export function modeloPara(status: string, modelos: Modelo[]): Modelo | null {
  const ativos = modelos.filter((x) => x.ativo);
  return ativos.find((x) => x.status.toLowerCase() === status.toLowerCase()) ?? ativos.find((x) => x.status === "Padrão") ?? null;
}

/** Mensagem pronta para uma marca (com as variáveis trocadas). */
export function montarMensagem(m: MarcaZap, modelo: string): string {
  const v: Record<string, string> = {
    cliente: (m.contato_nome || m.clients?.name || "").split(/\s+/)[0] || "tudo bem",
    marca: m.nome?.trim() || m.apelido?.trim() || "sua marca",
    processo: m.processo,
    status: statusDaMensagem(m),
    data: dataBR(m.proximo_prazo) || dataBR(m.ultimo_despacho_data),
    despacho: m.ultimo_despacho ?? "",
    data_despacho: dataBR(m.ultimo_despacho_data),
    classe: m.classe ?? "",
    proxima_etapa: m.previsao ?? "sem previsão no momento",
  };
  return modelo.replace(/\{(\w+)\}/g, (t, k) => v[k] ?? t);
}
