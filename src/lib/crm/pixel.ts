import "server-only";
import { createHash } from "node:crypto";
import { lerConfig } from "./dados";
import { telefoneLimpo, type Lead } from "./tipos";

// Pixels pelo servidor (06/11/2026). Meta: API de Conversões, com o mesmo
// event_id do pixel do navegador (a Meta junta os dois e não conta em dobro).
// Google: GA4 Measurement Protocol para quando o lead fecha (o navegador já
// manda o generate_lead e a conversão do Ads no envio do formulário).

const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");
const META_API = "https://graph.facebook.com/v21.0";

export type EventoMeta = "Lead" | "Schedule" | "Purchase" | "Contact";

export async function enviarMeta(evento: EventoMeta, lead: Lead, extra: { eventId?: string; valor?: number | null; url?: string } = {}): Promise<{ ok: boolean; erro?: string }> {
  const c = await lerConfig();
  if (!c.meta_pixel_id || !c.meta_capi_token) return { ok: false, erro: "Pixel da Meta não configurado." };
  const r = lead.rastreio ?? {};
  const tel = telefoneLimpo(lead.telefone);
  const [fn, ...resto] = (lead.nome ?? "").trim().split(/\s+/);
  const user_data: Record<string, unknown> = {
    external_id: [sha(lead.id)],
    ...(tel ? { ph: [sha(tel)] } : {}),
    ...(lead.email ? { em: [sha(lead.email)] } : {}),
    ...(fn ? { fn: [sha(fn)] } : {}),
    ...(resto.length ? { ln: [sha(resto.join(" "))] } : {}),
    country: [sha("br")],
    ...(r.fbp ? { fbp: r.fbp } : {}),
    ...(r.fbc ? { fbc: r.fbc } : r.fbclid ? { fbc: `fb.1.${Date.parse(lead.created_at) || Date.now()}.${r.fbclid}` } : {}),
    ...(r.ip ? { client_ip_address: r.ip } : {}),
    ...(r.ua ? { client_user_agent: r.ua } : {}),
  };
  const corpo = {
    data: [
      {
        event_name: evento,
        event_time: Math.floor(Date.now() / 1000),
        event_id: extra.eventId ?? `${evento.toLowerCase()}-${lead.id}`,
        action_source: evento === "Lead" ? "website" : "system_generated",
        ...(evento === "Lead" && (extra.url ?? r.pagina) ? { event_source_url: extra.url ?? r.pagina } : {}),
        user_data,
        custom_data: {
          lead_id: lead.id,
          ...(extra.valor ? { value: extra.valor, currency: "BRL" } : evento === "Purchase" ? { value: 0, currency: "BRL" } : {}),
          ...(lead.utm?.campaign ? { campaign: lead.utm.campaign } : {}),
        },
      },
    ],
    ...(c.meta_test_code ? { test_event_code: c.meta_test_code } : {}),
  };
  try {
    const res = await fetch(`${META_API}/${encodeURIComponent(c.meta_pixel_id)}/events?access_token=${encodeURIComponent(c.meta_capi_token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, erro: `Meta ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha" };
  }
}

/** GA4 (Measurement Protocol): só quando há o client_id do navegador (_ga) e o segredo. */
export async function enviarGa4(nome: "close_convert_lead" | "qualify_lead" | "generate_lead", lead: Lead, valor?: number | null): Promise<{ ok: boolean; erro?: string }> {
  const c = await lerConfig();
  const clientId = lead.rastreio?.ga;
  if (!c.ga4_id || !c.ga4_api_secret) return { ok: false, erro: "GA4 sem segredo do Measurement Protocol." };
  if (!clientId) return { ok: false, erro: "Lead sem identificador do Google (_ga)." };
  try {
    const res = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(c.ga4_id)}&api_secret=${encodeURIComponent(c.ga4_api_secret)}`, {
      method: "POST",
      body: JSON.stringify({ client_id: clientId, events: [{ name: nome, params: { currency: "BRL", value: valor ?? 0, lead_source: lead.utm?.source ?? lead.origem } }] }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok || res.status === 204 ? { ok: true } : { ok: false, erro: `GA4 ${res.status}` };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha" };
  }
}
