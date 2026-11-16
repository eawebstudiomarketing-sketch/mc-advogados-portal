import { after, NextResponse } from "next/server";
import { formularioPorSlug } from "@/lib/crm/dados";
import { criarLeadDoFormulario, depoisDoLead, registrarPassoFormulario } from "@/lib/crm/leads";
import { ligarVisitasAoLead, registrarEventos, registrarEventosDoLead, registrarRastro } from "@/lib/crm/visitas";

// Formulário público do CRM (06/11/2026). Sem login. Dois pedidos:
//  { passo: "abriu" | "comecou", sessao } → conta a visita no funil do formulário;
//  { rastro: {visita, visitante, passo, total, tempos, utm, ...} } → pixel próprio (até onde foi);
//  { eventos: [{nome, pergunta?, campo?}], visitante } → eventos do pixel próprio (16/11/2026);
//  { enviar: true, sessao, respostas, eventId, utm, rastreio } → cria o lead.
// O campo "site" é armadilha para robô (fica escondido na página).

const curto = (o: unknown, max = 300): Record<string, string> =>
  Object.fromEntries(
    Object.entries(o && typeof o === "object" ? (o as Record<string, unknown>) : {})
      .filter(([, v]) => typeof v === "string" && v)
      .slice(0, 20)
      .map(([k, v]) => [k.slice(0, 40), String(v).slice(0, max)]),
  );

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const form = await formularioPorSlug(slug);
  if (!form || !form.ativo) return NextResponse.json({ erro: "Formulário não encontrado." }, { status: 404 });
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const sessao = String(corpo.sessao ?? "");

  if (Array.isArray(corpo.eventos)) {
    await registrarEventos(form.id, sessao, typeof corpo.visitante === "string" ? corpo.visitante : undefined, corpo.eventos);
    return NextResponse.json({ ok: true });
  }
  if (corpo.rastro && typeof corpo.rastro === "object") {
    await registrarRastro(form.id, corpo.rastro as Parameters<typeof registrarRastro>[1], req.headers);
    return NextResponse.json({ ok: true });
  }
  if (corpo.passo === "abriu" || corpo.passo === "comecou") {
    await registrarPassoFormulario(form.id, sessao, corpo.passo);
    return NextResponse.json({ ok: true });
  }
  if (!corpo.enviar) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  if (corpo.site) return NextResponse.json({ ok: true }); // robô: finge que deu certo

  const respostasBrutas = corpo.respostas && typeof corpo.respostas === "object" ? (corpo.respostas as Record<string, unknown>) : {};
  const respostas: Record<string, string | string[]> = {};
  for (const c of form.config.campos) {
    const v = respostasBrutas[c.id];
    if (Array.isArray(v)) respostas[c.id] = v.filter((x) => typeof x === "string").slice(0, 30).map((x) => String(x).slice(0, 300));
    else if (typeof v === "string") respostas[c.id] = v.slice(0, 2000);
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const rastreio = { ...curto(corpo.rastreio, 500), ...(ip ? { ip } : {}), ua: (req.headers.get("user-agent") ?? "").slice(0, 400) };
  const eventId = String(corpo.eventId ?? "").slice(0, 64) || `lead-${crypto.randomUUID()}`;

  const r = await criarLeadDoFormulario(form, { respostas, sessao, eventId, utm: curto(corpo.utm, 200), rastreio });
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 422 });
  after(() => ligarVisitasAoLead(sessao, (rastreio as Record<string, string>).visitante, r.id).catch(() => null));
  after(() => registrarEventosDoLead(form.id, sessao, (rastreio as Record<string, string>).visitante, r.id).catch(() => null));
  if (r.novo) after(() => depoisDoLead(r.id, form).catch((e) => console.error("crm depoisDoLead:", e)));
  return NextResponse.json({ ok: true });
}
