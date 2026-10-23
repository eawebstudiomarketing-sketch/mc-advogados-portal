"use server";

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apagarAudio, linkDeEnvio } from "@/lib/transcricao";
import { aprovarEEnviar, cancelarAssinaturas, reenviarLink, telefoneZap } from "@/lib/atas/assinatura";
import { TIPOS_ATA, type Marcacao, type Participante, type TipoAta } from "@/lib/atas/formato";

// Gerador de atas. Cada pessoa vê as atas dela; admin vê todas (regras da
// migration 0039). A gravação mora em `transcricoes` (aparece também na aba
// Transcrição) e vai para o VPS em pedaços de 30 s.

const UUID = /^[0-9a-f-]{36}$/i;
const db = async () => (await createClient()) as unknown as SupabaseClient;
const agora = () => new Date().toISOString();

const limparParticipantes = (ps: Participante[]): Participante[] =>
  (ps ?? [])
    .filter((p) => p?.nome?.trim())
    .slice(0, 40)
    .map((p) => ({
      nome: p.nome.trim().slice(0, 120),
      papel: (["escritorio", "cliente", "outro"].includes(p.papel) ? p.papel : "cliente") as Participante["papel"],
      profile_id: p.profile_id ?? null,
      telefone: p.telefone?.trim().slice(0, 30) || null,
      email: p.email?.trim().slice(0, 160) || null,
      cargo: p.cargo?.trim().slice(0, 80) || null,
    }));

export type NovaAtaDados = {
  tipo: TipoAta;
  titulo: string;
  clientId: string | null;
  dataReuniao: string;
  local: string;
  pauta: string;
  participantes: Participante[];
  origem: "gravacao" | "arquivo";
  arquivoNome?: string;
};

/** Cria a ata + a gravação e devolve o link de envio para o VPS (vale 14 h). */
export async function criarAtaAction(d: NovaAtaDados): Promise<{ ok: true; id: string; envio: string } | { ok: false; erro: string }> {
  const { profile } = await exigirPermissao("atas");
  const tipo: TipoAta = d.tipo in TIPOS_ATA ? d.tipo : "reuniao_cliente";
  const titulo = d.titulo.trim().slice(0, 160) || TIPOS_ATA[tipo].titulo;
  const banco = await db();
  const { data: t, error: et } = await banco
    .from("transcricoes")
    .insert({
      profile_id: profile.id,
      titulo: `Gravação — ${titulo}`.slice(0, 140),
      arquivo_nome: d.origem === "arquivo" ? (d.arquivoNome ?? "arquivo").slice(0, 200) : "Gravação da reunião (ata)",
      modo: "fiel",
      opcoes: { falantes: true, tempo: true },
    })
    .select("id")
    .single();
  if (et || !t) return { ok: false, erro: "Não foi possível começar a gravação." };
  const data = new Date(d.dataReuniao);
  const { data: ata, error } = await banco
    .from("atas")
    .insert({
      profile_id: profile.id,
      client_id: d.clientId && UUID.test(d.clientId) ? d.clientId : null,
      transcricao_id: t.id,
      tipo,
      titulo,
      data_reuniao: Number.isNaN(data.getTime()) ? agora() : data.toISOString(),
      local: d.local.trim().slice(0, 120) || null,
      pauta: d.pauta.trim().slice(0, 2000) || null,
      participantes: limparParticipantes(d.participantes),
      status: "gravando",
    })
    .select("id")
    .single();
  if (error || !ata) {
    await banco.from("transcricoes").delete().eq("id", t.id);
    return { ok: false, erro: "Não foi possível criar a ata." };
  }
  try {
    return { ok: true, id: ata.id, envio: linkDeEnvio(t.id, 14) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Servidor de mídia indisponível." };
  }
}

/** Link novo de envio (a gravação passou de 14 h ou a página foi reaberta). */
export async function linkDeEnvioAction(id: string): Promise<string | null> {
  await exigirPermissao("atas");
  const ata = await lerAta(id);
  return ata?.transcricao_id ? linkDeEnvio(ata.transcricao_id, 14) : null;
}

async function lerAta(id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await (await db()).from("atas").select("id, status, transcricao_id, marcacoes").eq("id", id).maybeSingle();
  return data as { id: string; status: string; transcricao_id: string | null; marcacoes: Marcacao[] } | null;
}

export async function salvarMarcacoesAction(id: string, marcacoes: Marcacao[]): Promise<void> {
  await exigirPermissao("atas");
  if (!UUID.test(id)) return;
  const limpas = (marcacoes ?? []).slice(0, 200).map((m) => ({ seg: Math.max(0, Math.round(Number(m.seg) || 0)), tipo: m.tipo === "decisao" ? "decisao" : "importante" }));
  await (await db()).from("atas").update({ marcacoes: limpas }).eq("id", id);
}

/**
 * Fecha a gravação: junta os pedaços no VPS (ou confere o arquivo enviado
 * inteiro) e guarda a duração. A geração da ata é pedida em seguida em
 * /api/atas/[id]/gerar.
 */
export async function finalizarGravacaoAction(id: string, opcoes: { duracao?: number; pedacos: boolean }): Promise<{ ok: true } | { ok: false; erro: string }> {
  await exigirPermissao("atas");
  const ata = await lerAta(id);
  if (!ata?.transcricao_id) return { ok: false, erro: "Ata não encontrada." };
  if (ata.status !== "gravando" && ata.status !== "erro") return { ok: true };
  let duracao = Math.round(opcoes.duracao ?? 0);
  if (opcoes.pedacos) {
    const url = linkDeEnvio(ata.transcricao_id, 1).replace("?", "/fim?");
    const r = await fetch(url, { method: "POST" }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; duracao?: number; erro?: string } | null;
    if (!j?.ok) return { ok: false, erro: j?.erro ?? "O servidor de mídia não respondeu. Tente de novo em instantes." };
    duracao = Math.round(j.duracao ?? 0);
  }
  const adm = createAdminClient() as unknown as SupabaseClient;
  await adm.from("transcricoes").update({ duracao_seg: duracao || null }).eq("id", ata.transcricao_id);
  await adm.from("atas").update({ status: "processando", erro: null, updated_at: agora() }).eq("id", id);
  return { ok: true };
}

export type AtaEdicao = { titulo?: string; texto?: string; tipo?: TipoAta; local?: string; pauta?: string; dataReuniao?: string; participantes?: Participante[] };

export async function salvarAtaAction(id: string, c: AtaEdicao): Promise<{ ok: boolean; erro?: string }> {
  await exigirPermissao("atas");
  if (!UUID.test(id)) return { ok: false, erro: "Ata inválida." };
  const muda: Record<string, unknown> = { updated_at: agora() };
  if (c.titulo !== undefined) muda.titulo = c.titulo.trim().slice(0, 160) || "Ata de reunião";
  if (c.texto !== undefined) muda.texto = c.texto.slice(0, 200_000);
  if (c.tipo !== undefined && c.tipo in TIPOS_ATA) muda.tipo = c.tipo;
  if (c.local !== undefined) muda.local = c.local.trim().slice(0, 120) || null;
  if (c.pauta !== undefined) muda.pauta = c.pauta.trim().slice(0, 2000) || null;
  if (c.dataReuniao !== undefined && !Number.isNaN(new Date(c.dataReuniao).getTime())) muda.data_reuniao = new Date(c.dataReuniao).toISOString();
  if (c.participantes !== undefined) muda.participantes = limparParticipantes(c.participantes);
  // só rascunho se edita (aprovada/assinada ficam travadas: corrigir = nova versão)
  const { error, count } = await (await db()).from("atas").update(muda, { count: "exact" }).eq("id", id).in("status", ["rascunho", "erro"]);
  if (error) return { ok: false, erro: "Não foi possível salvar." };
  return count ? { ok: true } : { ok: false, erro: "Esta ata não pode mais ser editada." };
}

async function quemPede() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip"), ua: h.get("user-agent") };
}

/** Aprovar = assinar pelo escritório + mandar o link para cada pessoa de fora. */
export async function aprovarAtaAction(id: string, signatarios: Participante[]): Promise<{ ok: true; enviados: { nome: string; via: string[] }[] } | { ok: false; erro: string }> {
  const { profile } = await exigirPermissao("atas");
  const ata = await lerAta(id);
  if (!ata) return { ok: false, erro: "Ata não encontrada." };
  const meta = await quemPede();
  try {
    const r = await aprovarEEnviar(id, { profileId: profile.id, nome: profile.full_name, ip: meta.ip ?? null, ua: meta.ua ?? null }, limparParticipantes(signatarios));
    return { ok: true, enviados: r.enviados };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível aprovar." };
  }
}

export type AssinaturaLinha = { id: string; versao: number; nome: string; papel: string; status: string; telefone: string | null; email: string | null; enviado_em: string | null; assinado_em: string | null; assinado_via: string | null; lembretes: number; correcao: string | null };

export async function assinaturasAction(id: string): Promise<AssinaturaLinha[]> {
  await exigirPermissao("atas");
  if (!UUID.test(id)) return [];
  const { data } = await (await db())
    .from("ata_assinaturas")
    .select("id, versao, nome, papel, status, telefone, email, enviado_em, assinado_em, assinado_via, lembretes, correcao")
    .eq("ata_id", id)
    .order("versao", { ascending: false })
    .order("created_at");
  return (data ?? []) as AssinaturaLinha[];
}

async function assinaturaVisivel(assinaturaId: string): Promise<boolean> {
  if (!UUID.test(assinaturaId)) return false;
  const { data } = await (await db()).from("ata_assinaturas").select("id").eq("id", assinaturaId).maybeSingle();
  return !!data;
}

export async function reenviarAssinaturaAction(assinaturaId: string): Promise<{ ok: boolean; erro?: string; via?: string[] }> {
  await exigirPermissao("atas");
  if (!(await assinaturaVisivel(assinaturaId))) return { ok: false, erro: "Assinatura não encontrada." };
  try {
    return { ok: true, via: await reenviarLink(assinaturaId) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível reenviar." };
  }
}

export async function cancelarAssinaturasAction(id: string): Promise<{ ok: boolean; erro?: string }> {
  await exigirPermissao("atas");
  const ata = await lerAta(id);
  if (!ata || ata.status !== "aguardando") return { ok: false, erro: "Esta ata não está aguardando assinaturas." };
  await cancelarAssinaturas(id);
  return { ok: true };
}

export async function excluirAtaAction(id: string): Promise<{ ok: boolean; erro?: string }> {
  await exigirPermissao("atas");
  const ata = await lerAta(id);
  if (!ata) return { ok: false, erro: "Ata não encontrada." };
  if (ata.status === "aguardando" || ata.status === "assinada") return { ok: false, erro: "Ata enviada para assinatura ou assinada não pode ser excluída." };
  const banco = await db();
  const { count } = await banco.from("atas").delete({ count: "exact" }).eq("id", id);
  if (!count) return { ok: false, erro: "Não foi possível excluir." };
  if (ata.transcricao_id) {
    await apagarAudio(ata.transcricao_id);
    await banco.from("transcricoes").delete().eq("id", ata.transcricao_id);
  }
  return { ok: true };
}

/** Telefone e e-mail do cliente (para sugerir quem assina). */
export async function contatosDoClienteAction(clientId: string): Promise<{ telefones: string[]; email: string | null; nome: string } | null> {
  await exigirPermissao("atas");
  if (!UUID.test(clientId)) return null;
  const { data } = await (await db()).from("clients").select("name, telefones, whatsapp_numeros, email_contact").eq("id", clientId).maybeSingle();
  if (!data) return null;
  const c = data as { name: string; telefones: string[] | null; whatsapp_numeros: string[] | null; email_contact: string | null };
  const telefones = [...new Set([...(c.whatsapp_numeros ?? []), ...(c.telefones ?? [])].map((t) => telefoneZap(t)).filter((t): t is string => !!t))];
  return { telefones, email: c.email_contact, nome: c.name };
}
