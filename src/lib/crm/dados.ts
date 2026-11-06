import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverPermissoes } from "@/lib/permissoes";
import { CONFIG_VAZIA, type Etapa, type FormConfig, type Formulario, type Lead, type LeadEvento } from "./tipos";

// CRM / Comercial (06/11/2026): acesso ao banco. Tudo pelo servidor (service
// role); quem chama já conferiu a permissão "comercial" (ou é o envio público
// do formulário, que só cria lead).

export const db = () => createAdminClient() as unknown as SupabaseClient;

export type CrmConfig = {
  meta_pixel_id: string | null;
  meta_capi_token: string | null;
  meta_test_code: string | null;
  ga4_id: string | null;
  ga4_api_secret: string | null;
  ads_id: string | null;
  ads_label: string | null;
  rodizio: string[];
  rodizio_ultimo: number;
  avisar_zap: boolean;
};

export async function lerConfig(): Promise<CrmConfig> {
  const { data } = await db().from("crm_config").select("*").eq("id", 1).maybeSingle();
  return {
    meta_pixel_id: data?.meta_pixel_id ?? null,
    meta_capi_token: data?.meta_capi_token ?? null,
    meta_test_code: data?.meta_test_code ?? null,
    ga4_id: data?.ga4_id ?? null,
    ga4_api_secret: data?.ga4_api_secret ?? null,
    ads_id: data?.ads_id ?? null,
    ads_label: data?.ads_label ?? null,
    rodizio: (data?.rodizio as string[] | null) ?? [],
    rodizio_ultimo: Number(data?.rodizio_ultimo ?? -1),
    avisar_zap: data?.avisar_zap ?? true,
  };
}

/** O que o navegador pode saber (nunca o token nem o segredo). */
export async function pixelsPublicos(): Promise<{ meta: string | null; ga4: string | null; ads: string | null; adsLabel: string | null }> {
  const c = await lerConfig();
  return { meta: c.meta_pixel_id, ga4: c.ga4_id, ads: c.ads_id, adsLabel: c.ads_label };
}

// ───────── etapas ─────────

export async function listarEtapas(): Promise<Etapa[]> {
  const { data } = await db().from("crm_etapas").select("id, nome, ordem, cor, tipo").order("ordem");
  return (data ?? []) as Etapa[];
}

export async function etapaInicial(): Promise<Etapa | null> {
  return (await listarEtapas()).find((e) => e.tipo === "aberta") ?? null;
}

// ───────── formulários ─────────

const paraForm = (r: Record<string, unknown>): Formulario => {
  const c = (r.config ?? {}) as Partial<FormConfig>;
  return {
    ...(r as unknown as Formulario),
    config: {
      tema: { ...CONFIG_VAZIA.tema, ...(c.tema ?? {}) },
      boasVindas: { ...CONFIG_VAZIA.boasVindas, ...(c.boasVindas ?? {}) },
      final: { ...CONFIG_VAZIA.final, ...(c.final ?? {}) },
      campos: c.campos ?? [],
    },
  };
};

export async function listarFormularios(): Promise<Formulario[]> {
  const { data } = await db().from("crm_formularios").select("*").order("created_at");
  return (data ?? []).map(paraForm);
}

export async function formularioPorSlug(slug: string): Promise<Formulario | null> {
  const { data } = await db().from("crm_formularios").select("*").eq("slug", slug).maybeSingle();
  return data ? paraForm(data) : null;
}

export async function formularioPorId(id: string): Promise<Formulario | null> {
  const { data } = await db().from("crm_formularios").select("*").eq("id", id).maybeSingle();
  return data ? paraForm(data) : null;
}

/** Visitas, quem começou e quem enviou, por formulário (desde `desde`). */
export async function funilDosFormularios(desde: string): Promise<Map<string, { abriu: number; comecou: number; enviou: number }>> {
  const m = new Map<string, { abriu: number; comecou: number; enviou: number }>();
  for (let de = 0; ; de += 1000) {
    const { data } = await db().from("crm_form_eventos").select("formulario_id, tipo").gte("created_at", desde).range(de, de + 999);
    for (const r of data ?? []) {
      const x = m.get(r.formulario_id as string) ?? { abriu: 0, comecou: 0, enviou: 0 };
      x[r.tipo as "abriu" | "comecou" | "enviou"]++;
      m.set(r.formulario_id as string, x);
    }
    if ((data ?? []).length < 1000) break;
  }
  return m;
}

// ───────── leads ─────────

const paraLead = (r: Record<string, unknown>): Lead => ({
  ...(r as unknown as Lead),
  respostas: (r.respostas as Lead["respostas"]) ?? [],
  utm: (r.utm as Lead["utm"]) ?? {},
  rastreio: (r.rastreio as Lead["rastreio"]) ?? {},
  tags: (r.tags as string[]) ?? [],
  valor: r.valor === null || r.valor === undefined ? null : Number(r.valor),
});

export async function listarLeads(f: { busca?: string; formulario?: string; responsavel?: string; desde?: string } = {}): Promise<Lead[]> {
  const todos: Lead[] = [];
  for (let de = 0; ; de += 1000) {
    let q = db().from("leads").select("*").order("created_at", { ascending: false }).range(de, de + 999);
    if (f.formulario) q = q.eq("formulario_id", f.formulario);
    if (f.responsavel === "sem") q = q.is("responsavel", null);
    else if (f.responsavel) q = q.eq("responsavel", f.responsavel);
    if (f.desde) q = q.gte("created_at", f.desde);
    if (f.busca?.trim()) {
      const t = f.busca.trim().replace(/[%,()]/g, " ");
      const dig = t.replace(/\D/g, "");
      q = q.or([`nome.ilike.%${t}%`, `empresa.ilike.%${t}%`, `email.ilike.%${t}%`, ...(dig.length >= 4 ? [`telefone.ilike.%${dig}%`] : [])].join(","));
    }
    const { data } = await q;
    todos.push(...(data ?? []).map(paraLead));
    if ((data ?? []).length < 1000) break;
  }
  return todos;
}

export async function lerLead(id: string): Promise<Lead | null> {
  const { data } = await db().from("leads").select("*").eq("id", id).maybeSingle();
  return data ? paraLead(data) : null;
}

export async function eventosDoLead(id: string): Promise<LeadEvento[]> {
  const { data } = await db().from("crm_lead_eventos").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as LeadEvento[];
}

export async function registrarEvento(leadId: string, tipo: string, texto: string | null, dados: Record<string, unknown> = {}, autor: string | null = null) {
  await db().from("crm_lead_eventos").insert({ lead_id: leadId, tipo, texto, dados, autor });
}

/** Status antigo da tabela leads (0020), mantido em dia para o Painel e o Assistente do WhatsApp. */
export const statusDaEtapa = (e: Etapa | undefined) => (e?.tipo === "ganho" ? "cliente" : e?.tipo === "perdido" ? "perdido" : "novo");

/** Quem recebe o lead novo: rodízio da configuração; sem rodízio, o responsável do formulário. */
export async function proximoResponsavel(padrao: string | null): Promise<string | null> {
  const c = await lerConfig();
  if (!c.rodizio.length) return padrao;
  const i = (c.rodizio_ultimo + 1) % c.rodizio.length;
  await db().from("crm_config").update({ rodizio_ultimo: i }).eq("id", 1);
  return c.rodizio[i];
}

/** Pessoas que podem cuidar de lead: admin máximo + quem tem a permissão "comercial". */
export async function equipeComercial(): Promise<{ id: string; nome: string }[]> {
  const [{ data }, { data: perms }] = await Promise.all([
    db().from("profiles").select("id, full_name, role, super_admin, ativo, oculto").in("role", ["admin", "advogado"]).eq("ativo", true),
    db().from("equipe_permissoes").select("profile_id, permissoes"),
  ]);
  const salvas = new Map((perms ?? []).map((p) => [p.profile_id as string, p.permissoes]));
  return (data ?? [])
    .filter((p) => !p.oculto && resolverPermissoes(p.role as string, salvas.get(p.id as string), !!p.super_admin && p.role === "admin").comercial)
    .map((p) => ({ id: p.id as string, nome: (p.full_name as string) ?? "Sem nome" }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

/** Conversa do WhatsApp do escritório com o lead (as últimas mensagens), pelo número. */
export async function conversaDoLead(telefone: string | null, chatJid: string | null): Promise<{ jid: string; mensagens: { id: string; from_me: boolean; texto: string | null; tipo: string; created_at: string }[] } | null> {
  const t = (telefone ?? "").replace(/\D/g, "");
  // celular do Brasil às vezes está no WhatsApp sem o 9 da frente
  const sem9 = t.length === 13 && t.startsWith("55") && t[4] === "9" ? `${t.slice(0, 4)}${t.slice(5)}` : null;
  const jids = [chatJid, t ? `${t}@s.whatsapp.net` : null, sem9 ? `${sem9}@s.whatsapp.net` : null].filter(Boolean) as string[];
  if (!jids.length) return null;
  const { data } = await db().from("wa_messages").select("id, chat_jid, from_me, texto, tipo, created_at").in("chat_jid", jids).order("created_at", { ascending: false }).limit(30);
  if (!data?.length) return null;
  return { jid: data[0].chat_jid as string, mensagens: (data as { id: string; from_me: boolean; texto: string | null; tipo: string; created_at: string }[]).reverse() };
}
