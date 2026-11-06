import "server-only";
import { db } from "./dados";

// Pixel próprio do CRM (06/11/2026): uma linha por visita aos formulários,
// atualizada a cada pergunta. Guarda origem, aparelho, cidade aproximada (da
// Vercel) e até onde a pessoa foi; não guarda o que foi digitado por quem não
// enviou. No envio, a visita e as anteriores do mesmo aparelho ligam no lead.

export type Visita = {
  id: string;
  visitante: string;
  formulario_id: string;
  lead_id: string | null;
  inicio: string;
  ultimo_em: string;
  passo_max: number;
  passo_atual: number;
  total_passos: number;
  enviou: boolean;
  tempos: Record<string, number>;
  canal: string | null;
  utm: Record<string, string>;
  referrer: string | null;
  aparelho: string | null;
  sistema: string | null;
  navegador: string | null;
  cidade: string | null;
  uf: string | null;
  pais: string | null;
};

const ID = /^[a-z0-9-]{8,64}$/i;
/** passo_atual de quem fechou a página (some de "preenchendo agora"; se voltar, o próximo passo sobrescreve). */
export const SAIU = -9;

function lerAparelho(ua: string) {
  const sistema = /iphone|ipad|ipod/i.test(ua) ? (/ipad/i.test(ua) ? "iPad" : "iPhone") : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : "Outro";
  const aparelho = /ipad|tablet/i.test(ua) ? "Tablet" : /mobi|iphone|android/i.test(ua) ? "Celular" : "Computador";
  const navegador = /instagram/i.test(ua) ? "Instagram" : /fban|fbav|fb_iab/i.test(ua) ? "Facebook" : /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : /firefox|fxios/i.test(ua) ? "Firefox" : "Outro";
  return { aparelho, sistema, navegador };
}

export function canalDe(utm: Record<string, string>, extra: { fbclid?: boolean; gclid?: boolean; referrer?: string | null; navegador?: string | null }): string {
  if (extra.gclid) return "Anúncio Google";
  if (extra.fbclid || (/^(fb|facebook|ig|instagram|meta)$/i.test(utm.source ?? "") && /paid|cpc|ads?/i.test(utm.medium ?? ""))) return "Anúncio Meta";
  if (utm.source) return utm.source.charAt(0).toUpperCase() + utm.source.slice(1);
  if (extra.navegador === "Instagram") return "Instagram";
  if (extra.navegador === "Facebook") return "Facebook";
  const ref = (extra.referrer ?? "").toLowerCase();
  if (ref.includes("instagram")) return "Instagram";
  if (ref.includes("facebook")) return "Facebook";
  if (ref.includes("google")) return "Google (busca)";
  if (ref.includes("whatsapp") || ref.includes("wa.me")) return "WhatsApp";
  if (ref && !ref.includes("mcadvogados.app.br")) return ref.replace(/^https?:\/\//, "").split("/")[0];
  return "Link direto";
}

const decodar = (v: string | null) => {
  if (!v) return null;
  try {
    return decodeURIComponent(v).slice(0, 80);
  } catch {
    return v.slice(0, 80);
  }
};

/** Chegou um passo do pixel (abriu, mudou de pergunta, saiu). */
export async function registrarRastro(
  formularioId: string,
  r: { visita: string; visitante: string; passo: number; total: number; tempos?: Record<string, unknown>; utm?: Record<string, string>; fbclid?: boolean; gclid?: boolean; referrer?: string; saiu?: boolean },
  headers: Headers,
) {
  if (!ID.test(r.visita) || !ID.test(r.visitante)) return;
  const passo = Math.max(-1, Math.min(200, Math.trunc(Number(r.passo) || -1)));
  const tempos = Object.fromEntries(
    Object.entries(r.tempos ?? {})
      .filter(([k, v]) => /^[a-z0-9_-]{1,40}$/i.test(k) && Number.isFinite(Number(v)))
      .slice(0, 60)
      .map(([k, v]) => [k, Math.min(3_600_000, Math.max(0, Math.round(Number(v))))]),
  );
  const agora = new Date().toISOString();
  const { data: atual } = await db().from("crm_visitas").select("id, formulario_id, passo_max").eq("id", r.visita).maybeSingle();
  if (atual) {
    if (atual.formulario_id !== formularioId) return;
    await db()
      .from("crm_visitas")
      .update({ ultimo_em: agora, passo_atual: r.saiu ? SAIU : passo, passo_max: Math.max(Number(atual.passo_max), passo), ...(Object.keys(tempos).length ? { tempos } : {}) })
      .eq("id", r.visita);
    return;
  }
  const ua = headers.get("user-agent") ?? "";
  const ap = lerAparelho(ua);
  const utm = Object.fromEntries(Object.entries(r.utm ?? {}).filter(([k, v]) => ["source", "medium", "campaign", "content", "term"].includes(k) && typeof v === "string").map(([k, v]) => [k, String(v).slice(0, 120)]));
  const referrer = r.referrer ? String(r.referrer).slice(0, 300) : null;
  await db()
    .from("crm_visitas")
    .upsert(
      {
        id: r.visita,
        visitante: r.visitante,
        formulario_id: formularioId,
        inicio: agora,
        ultimo_em: agora,
        passo_max: passo,
        passo_atual: passo,
        total_passos: Math.max(0, Math.min(200, Math.trunc(Number(r.total) || 0))),
        tempos,
        canal: canalDe(utm, { fbclid: r.fbclid, gclid: r.gclid, referrer, navegador: ap.navegador }),
        utm,
        referrer,
        ...ap,
        cidade: decodar(headers.get("x-vercel-ip-city")),
        uf: decodar(headers.get("x-vercel-ip-country-region")),
        pais: decodar(headers.get("x-vercel-ip-country")),
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  // limpeza de vez em quando: visitas com mais de 90 dias
  if (Math.random() < 0.02) await db().from("crm_visitas").delete().lt("inicio", new Date(Date.now() - 90 * 86_400_000).toISOString());
}

/** O lead chegou: marca a visita como enviada e liga as visitas do mesmo aparelho a ele. */
export async function ligarVisitasAoLead(visita: string, visitante: string | undefined, leadId: string) {
  if (!ID.test(visita)) return;
  await db().from("crm_visitas").update({ enviou: true, lead_id: leadId, ultimo_em: new Date().toISOString() }).eq("id", visita);
  if (visitante && ID.test(visitante)) await db().from("crm_visitas").update({ lead_id: leadId }).eq("visitante", visitante).is("lead_id", null);
}

export async function listarVisitas(f: { desde: string; formulario?: string }): Promise<Visita[]> {
  const todas: Visita[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    let q = db().from("crm_visitas").select("*").gte("inicio", f.desde).order("inicio", { ascending: false }).range(de, de + 999);
    if (f.formulario) q = q.eq("formulario_id", f.formulario);
    const { data } = await q;
    todas.push(...((data ?? []) as Visita[]));
    if ((data ?? []).length < 1000) break;
  }
  return todas;
}

export async function visitasDoLead(leadId: string): Promise<Visita[]> {
  const { data } = await db().from("crm_visitas").select("*").eq("lead_id", leadId).order("inicio");
  return (data ?? []) as Visita[];
}
