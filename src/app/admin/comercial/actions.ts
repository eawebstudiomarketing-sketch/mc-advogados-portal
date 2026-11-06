"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirPermissao } from "@/lib/dal";
import { db, etapaInicial, formularioPorId, lerConfig, lerLead, registrarEvento } from "@/lib/crm/dados";
import { moverLead, virarCliente } from "@/lib/crm/leads";
import { enviarMeta } from "@/lib/crm/pixel";
import { CONFIG_VAZIA, CORES, telefoneLimpo, type Etapa, type FormConfig } from "@/lib/crm/tipos";

// Ações do CRM / Comercial (06/11/2026). Todas pedem a permissão "comercial".

type Resultado = { ok: true } | { ok: false; erro: string };
const CRM = "/admin/comercial";
const revalidar = (id?: string) => {
  revalidatePath(CRM);
  if (id) revalidatePath(`${CRM}/${id}`);
};

export async function moverLeadAction(leadId: string, etapaId: string, extra: { motivo?: string | null; valor?: number | null } = {}): Promise<Resultado> {
  const { profile } = await exigirPermissao("comercial");
  const r = await moverLead(leadId, etapaId, profile.id, extra);
  if (!r.ok) return { ok: false, erro: r.erro };
  revalidar(leadId);
  return { ok: true };
}

const txt = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max) || null;

export async function salvarLeadAction(formData: FormData): Promise<Resultado> {
  const { profile } = await exigirPermissao("comercial");
  const id = String(formData.get("id") ?? "");
  const atual = await lerLead(id);
  if (!atual) return { ok: false, erro: "Lead não encontrado." };
  const valorTxt = txt(formData, "valor");
  const valor = valorTxt ? Number(valorTxt.replace(/\./g, "").replace(",", ".")) : null;
  if (valorTxt && !Number.isFinite(valor)) return { ok: false, erro: "Valor inválido." };
  const prox = txt(formData, "proximo_contato");
  const campos = {
    nome: txt(formData, "nome"),
    empresa: txt(formData, "empresa"),
    telefone: telefoneLimpo(txt(formData, "telefone")) || null,
    email: txt(formData, "email"),
    responsavel: txt(formData, "responsavel"),
    valor,
    proximo_contato: prox ? new Date(`${prox}:00-03:00`).toISOString() : null,
    observacoes: txt(formData, "observacoes", 5000),
    tags: String(formData.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 15),
    updated_at: new Date().toISOString(),
  };
  const { error } = await db().from("leads").update(campos).eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  if (campos.responsavel !== atual.responsavel) await registrarEvento(id, "responsavel", "Responsável trocado", { de: atual.responsavel, para: campos.responsavel }, profile.id);
  if (campos.proximo_contato && campos.proximo_contato !== atual.proximo_contato)
    await registrarEvento(id, "nota", `Próximo contato marcado para ${new Date(campos.proximo_contato).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" })}`, {}, profile.id);
  revalidar(id);
  return { ok: true };
}

export async function notaLeadAction(leadId: string, texto: string): Promise<Resultado> {
  const { profile } = await exigirPermissao("comercial");
  const t = texto.trim();
  if (!t) return { ok: false, erro: "Escreva a anotação." };
  await registrarEvento(leadId, "nota", t.slice(0, 4000), {}, profile.id);
  await db().from("leads").update({ updated_at: new Date().toISOString() }).eq("id", leadId);
  revalidar(leadId);
  return { ok: true };
}

/** Clicou em "Chamar no WhatsApp" (ou registrou ligação): conta como contato. */
export async function contatoLeadAction(leadId: string, meio: "whatsapp" | "ligacao" | "email"): Promise<Resultado> {
  const { profile } = await exigirPermissao("comercial");
  const lead = await lerLead(leadId);
  if (!lead) return { ok: false, erro: "Lead não encontrado." };
  const rotulo = { whatsapp: "Chamou no WhatsApp", ligacao: "Ligou", email: "Mandou e-mail" }[meio];
  await registrarEvento(leadId, "contato", rotulo, { meio }, profile.id);
  if (!lead.primeiro_contato_em) await db().from("leads").update({ primeiro_contato_em: new Date().toISOString() }).eq("id", leadId);
  revalidar(leadId);
  return { ok: true };
}

export async function virarClienteAction(leadId: string): Promise<Resultado> {
  const { profile } = await exigirPermissao("comercial", "clientes");
  const r = await virarCliente(leadId, profile.id);
  if (!r.ok) return { ok: false, erro: r.erro };
  revalidar(leadId);
  revalidatePath("/admin/clients");
  redirect(`/admin/clients/${r.clientId}/handoff`);
}

export async function novoLeadAction(formData: FormData): Promise<Resultado> {
  const { profile } = await exigirPermissao("comercial");
  const nome = txt(formData, "nome");
  const telefone = telefoneLimpo(txt(formData, "telefone")) || null;
  if (!nome && !telefone) return { ok: false, erro: "Informe pelo menos o nome ou o WhatsApp." };
  const etapa = await etapaInicial();
  const { data, error } = await db()
    .from("leads")
    .insert({ nome, telefone, empresa: txt(formData, "empresa"), email: txt(formData, "email"), origem: txt(formData, "origem", 40) ?? "manual", status: "novo", etapa_id: etapa?.id ?? null, responsavel: txt(formData, "responsavel") ?? profile.id, observacoes: txt(formData, "observacoes", 5000) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Não foi possível criar o lead." };
  await registrarEvento(data.id, "criado", "Cadastrado à mão", {}, profile.id);
  revalidar();
  redirect(`${CRM}/${data.id}`);
}

export async function excluirLeadAction(leadId: string): Promise<Resultado> {
  await exigirPermissao("comercial", "excluir");
  const { error } = await db().from("leads").delete().eq("id", leadId);
  if (error) return { ok: false, erro: "Não foi possível excluir." };
  revalidar();
  redirect(CRM);
}

// ───────── formulários ─────────

export async function salvarFormularioAction(input: { id: string | null; slug: string; nome: string; ativo: boolean; responsavel_padrao: string | null; config: FormConfig }): Promise<Resultado & { id?: string }> {
  await exigirPermissao("comercial");
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return { ok: false, erro: "O endereço só pode ter letras minúsculas, números e hífen (ex.: registro-de-marca)." };
  if (!input.nome.trim()) return { ok: false, erro: "Dê um nome ao formulário." };
  const ids = new Set<string>();
  for (const c of input.config.campos) {
    if (!c.titulo.trim()) return { ok: false, erro: "Toda pergunta precisa de um texto." };
    if ((c.tipo === "escolha" || c.tipo === "multipla") && !(c.opcoes ?? []).filter((o) => o.trim()).length) return { ok: false, erro: `Coloque as opções de “${c.titulo}”.` };
    if (ids.has(c.id)) return { ok: false, erro: "Pergunta repetida." };
    ids.add(c.id);
  }
  const linha = { slug, nome: input.nome.trim().slice(0, 120), ativo: input.ativo, responsavel_padrao: input.responsavel_padrao || null, config: { ...CONFIG_VAZIA, ...input.config }, updated_at: new Date().toISOString() };
  const q = input.id ? db().from("crm_formularios").update(linha).eq("id", input.id).select("id").single() : db().from("crm_formularios").insert(linha).select("id").single();
  const { data, error } = await q;
  if (error || !data) return { ok: false, erro: /duplicate|unique/.test(error?.message ?? "") ? "Já existe um formulário com esse endereço." : "Não foi possível salvar." };
  revalidatePath(`${CRM}/formularios`);
  revalidatePath(`/f/${slug}`);
  return { ok: true, id: data.id as string };
}

export async function duplicarFormularioAction(id: string): Promise<Resultado> {
  await exigirPermissao("comercial");
  const f = await formularioPorId(id);
  if (!f) return { ok: false, erro: "Formulário não encontrado." };
  const { data, error } = await db()
    .from("crm_formularios")
    .insert({ slug: `${f.slug}-copia-${Math.random().toString(36).slice(2, 6)}`.slice(0, 60), nome: `${f.nome} (cópia)`, ativo: false, config: f.config, responsavel_padrao: f.responsavel_padrao })
    .select("id")
    .single();
  if (error || !data) return { ok: false, erro: "Não foi possível duplicar." };
  revalidatePath(`${CRM}/formularios`);
  redirect(`${CRM}/formularios/${data.id}`);
}

export async function excluirFormularioAction(id: string): Promise<Resultado> {
  await exigirPermissao("comercial", "excluir");
  const { error } = await db().from("crm_formularios").delete().eq("id", id);
  if (error) return { ok: false, erro: "Não foi possível excluir." };
  revalidatePath(`${CRM}/formularios`);
  redirect(`${CRM}/formularios`);
}

export async function enviarImagemAction(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  await exigirPermissao("comercial");
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { ok: false, erro: "Escolha uma imagem." };
  if (!/^image\/(png|jpe?g|webp|gif)$/.test(arquivo.type)) return { ok: false, erro: "Use PNG, JPG ou WEBP." };
  if (arquivo.size > 8 * 1024 * 1024) return { ok: false, erro: "Imagem muito grande (máx. 8 MB)." };
  const ext = arquivo.type.split("/")[1].replace("jpeg", "jpg");
  const caminho = `crm/formularios/${crypto.randomUUID()}.${ext}`;
  const s = db().storage.from("avatars");
  const { error } = await s.upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
  if (error) return { ok: false, erro: "Não foi possível enviar a imagem." };
  return { ok: true, url: s.getPublicUrl(caminho).data.publicUrl };
}

// ───────── configuração ─────────

export async function salvarConfigAction(formData: FormData): Promise<Resultado> {
  await exigirPermissao("comercial");
  const atual = await lerConfig();
  const segredo = (k: "meta_capi_token" | "ga4_api_secret") => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? atual[k] : v === "-" ? null : v; // vazio mantém o salvo; "-" apaga
  };
  const id = (k: string, re: RegExp) => {
    const v = String(formData.get(k) ?? "").trim();
    return v && re.test(v) ? v : null;
  };
  const metaId = String(formData.get("meta_pixel_id") ?? "").trim();
  if (metaId && !/^\d{8,20}$/.test(metaId)) return { ok: false, erro: "O ID do Pixel da Meta são só números (15 ou 16 dígitos)." };
  const ga4 = String(formData.get("ga4_id") ?? "").trim().toUpperCase();
  if (ga4 && !/^G-[A-Z0-9]{4,15}$/.test(ga4)) return { ok: false, erro: "O ID do GA4 começa com G- (ex.: G-ABC123XYZ)." };
  const ads = String(formData.get("ads_id") ?? "").trim().toUpperCase();
  if (ads && !/^AW-\d{6,15}$/.test(ads)) return { ok: false, erro: "O ID do Google Ads começa com AW- (ex.: AW-123456789)." };
  const { error } = await db()
    .from("crm_config")
    .update({
      meta_pixel_id: metaId || null,
      meta_capi_token: segredo("meta_capi_token"),
      meta_test_code: id("meta_test_code", /^[A-Z0-9]{3,20}$/i),
      ga4_id: ga4 || null,
      ga4_api_secret: segredo("ga4_api_secret"),
      ads_id: ads || null,
      ads_label: id("ads_label", /^[A-Za-z0-9_-]{3,60}$/),
      rodizio: formData.getAll("rodizio").map(String).filter(Boolean),
      avisar_zap: formData.get("avisar_zap") === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  revalidatePath(`${CRM}/configurar`);
  return { ok: true };
}

export async function testarMetaAction(): Promise<Resultado> {
  await exigirPermissao("comercial");
  const agora = new Date().toISOString();
  const r = await enviarMeta("Lead", {
    id: `teste-${Date.now()}`,
    nome: "Teste do Portal",
    telefone: "5573900000000",
    email: null,
    empresa: null,
    origem: "teste",
    status: "novo",
    etapa_id: null,
    formulario_id: null,
    responsavel: null,
    client_id: null,
    chat_jid: null,
    respostas: [],
    utm: {},
    rastreio: {},
    valor: null,
    motivo_perda: null,
    proximo_contato: null,
    primeiro_contato_em: null,
    ganho_em: null,
    perdido_em: null,
    tags: [],
    observacoes: null,
    created_at: agora,
    updated_at: agora,
  });
  return r.ok ? { ok: true } : { ok: false, erro: r.erro ?? "Falhou." };
}

export async function salvarEtapasAction(etapas: Pick<Etapa, "id" | "nome" | "cor" | "tipo">[]): Promise<Resultado> {
  await exigirPermissao("comercial");
  const limpas = etapas.map((e, i) => ({ ...e, nome: e.nome.trim().slice(0, 40), cor: CORES.includes(e.cor) ? e.cor : "navy", ordem: i + 1 }));
  if (limpas.some((e) => !e.nome)) return { ok: false, erro: "Toda etapa precisa de nome." };
  if (!limpas.some((e) => e.tipo === "aberta")) return { ok: false, erro: "Deixe pelo menos uma etapa aberta (onde o lead entra)." };
  const { data: atuais } = await db().from("crm_etapas").select("id");
  const ficam = new Set(limpas.filter((e) => e.id).map((e) => e.id));
  const sair = (atuais ?? []).map((a) => a.id as string).filter((id) => !ficam.has(id));
  if (sair.length) {
    const { count } = await db().from("leads").select("id", { count: "exact", head: true }).in("etapa_id", sair);
    if (count) return { ok: false, erro: `Há ${count} lead(s) numa etapa que você tirou. Mova-os antes.` };
    await db().from("crm_etapas").delete().in("id", sair);
  }
  for (const e of limpas) {
    if (e.id) await db().from("crm_etapas").update({ nome: e.nome, cor: e.cor, tipo: e.tipo, ordem: e.ordem }).eq("id", e.id);
    else await db().from("crm_etapas").insert({ nome: e.nome, cor: e.cor, tipo: e.tipo, ordem: e.ordem });
  }
  revalidatePath(CRM);
  revalidatePath(`${CRM}/configurar`);
  return { ok: true };
}
