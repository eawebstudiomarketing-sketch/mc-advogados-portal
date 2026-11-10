import "server-only";

// Base própria de marcas (09/11/2026): cópia montada na VPS com todas as
// revistas (RPI) de marcas desde 2017 (~/marcas/indexar.py, atualizada toda
// semana). É a reserva das buscas quando o pePI do INPI está fora do ar:
// mesma forma de resultado, com a situação tirada do último despacho publicado.

export type LinhaBase = {
  numero: string;
  marca: string | null;
  apresentacao: string | null;
  natureza: string | null;
  classes: string | null;
  especificacao: string | null;
  titular: string | null;
  uf: string | null;
  pais: string | null;
  procurador: string | null;
  deposito: string | null;
  concessao: string | null;
  vigencia: string | null;
  ultimo_codigo: string | null;
  ultimo_despacho: string | null;
  ultima_rpi: number | null;
  ultima_data: string | null;
};

export type RespostaBase = { fonte: "base-propria"; revista: number | null; data: string | null; total: number; resultados: LinhaBase[] };

export async function consultarBase(tipo: "processo" | "exata" | "radical" | "titular" | "procurador", termo: string, classe?: string | null, limite = 100, tempoMs = 30_000): Promise<RespostaBase> {
  const base = process.env.WA_MIDIA_URL;
  const segredo = process.env.WA_MIDIA_SEGREDO;
  if (!base || !segredo) throw new Error("Base própria não configurada (WA_MIDIA_URL).");
  const r = await fetch(`${base}/marcas-base`, {
    method: "POST",
    headers: { Authorization: `Bearer ${segredo}`, "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, termo, classe: classe ?? null, limite }),
    signal: AbortSignal.timeout(tempoMs),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as RespostaBase & { erro?: string };
  if (!r.ok) throw new Error(`Base própria: ${j.erro ?? r.status}`);
  return j;
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Situação aproximada a partir do último despacho publicado na revista. */
export function situacaoDoDespacho(despacho: string | null, concessao: string | null): string {
  const d = sem(despacho ?? "");
  if (!d) return concessao ? "Registro de marca em vigor" : "Sem despacho publicado";
  if (d.includes("extin") || d.includes("caducidade")) return "Registro extinto";
  if (d.includes("nulidade")) return d.includes("instaura") ? "Registro em processo de nulidade" : "Registro de marca nulo";
  if (d.includes("arquivamento")) return "Pedido arquivado";
  if (d.includes("indeferimento")) return "Pedido indeferido";
  if (d.includes("recurso")) return "Em recurso";
  if (d.includes("sobrestamento")) return "Sobrestado";
  if (d.includes("concessao de registro") || d.includes("prorrogacao") || d.includes("anotacao") || d.includes("renovacao")) return "Registro de marca em vigor";
  if (d.includes("deferimento")) return "Pedido deferido (aguardando pagamento da concessão)";
  if (d.includes("publicacao de pedido")) return "Aguardando prazo de oposição";
  if (d.includes("oposicao")) return "Aguardando exame de mérito (com oposição)";
  if (d.includes("exigencia")) return "Exigência a cumprir";
  return concessao ? "Registro de marca em vigor" : `Em andamento: ${despacho}`;
}
