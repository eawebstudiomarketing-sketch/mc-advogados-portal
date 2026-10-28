import type { WaAgente, WaChat } from "@/lib/whatsapp";

// Funções da tela WhatsApp que rodam no navegador.

export const HEARTBEAT_LIMITE_MS = 35_000; // igual a lib/whatsapp (não dá pra importar server-only aqui)

// O relógio do PC de quem usa pode estar adiantado/atrasado: comparar o batimento
// (hora do servidor) com Date.now() direto dava "fora do ar" eterno. Calibra pelo
// próprio batimento quando se sabe que ele é recente (veio agora pelo tempo real,
// ou o servidor disse que está ligado).
let desvio = 0;
export function calibrarRelogio(a: WaAgente | null) {
  if (a?.last_heartbeat) desvio = new Date(a.last_heartbeat).getTime() - Date.now();
}
export const agoraServidor = () => Date.now() + desvio;
export const ligadoAgora = (a: WaAgente | null) =>
  !!a?.online && !!a.last_heartbeat && agoraServidor() - new Date(a.last_heartbeat).getTime() < HEARTBEAT_LIMITE_MS;

export const telefone = (jid: string) => {
  if (jid.endsWith("@g.us")) return "Grupo";
  if (jid.endsWith("@lid")) return "Número oculto pelo WhatsApp";
  const d = jid.split("@")[0];
  if (d.length === 13 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return d ? `+${d}` : "";
};

export function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === ontem.toDateString()) return "ontem";
  if (hoje.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: d.getFullYear() === hoje.getFullYear() ? undefined : "2-digit" });
}

export const diaDe = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric" });
};

/** Chave do dia (para saber quando começa um dia novo na conversa). */
export const diaChave = (iso: string) => new Date(iso).toDateString();

/** Rótulo do cartãozinho de data, como no WhatsApp: Hoje, Ontem, ou "segunda-feira, 26 de outubro". */
export const diaCompleto = (iso: string) => {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === hoje.getFullYear() ? undefined : "numeric" });
};

/** Data e hora por extenso (dica ao passar o mouse na hora da mensagem). */
export const dataHoraCompleta = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const iniciais = (nome: string) =>
  nome
    .replace(/[^\p{L}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";

/** Fixadas primeiro, depois a mais recente. */
export const ordenar = (cs: WaChat[]) =>
  [...cs].sort((a, b) => Number(!!b.fixado) - Number(!!a.fixado) || (b.ultima_msg_em ?? "").localeCompare(a.ultima_msg_em ?? ""));

export const EMOJIS_RAPIDOS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const tamanhoLegivel = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`;
