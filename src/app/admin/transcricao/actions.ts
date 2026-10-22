"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole, temPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { apagarAudio, importarDoWhatsapp, linkDeEnvio, resumirTexto } from "@/lib/transcricao";
import { audioDoWhatsapp, listarAudiosDoWhatsapp, tituloDoAudio, type AudioZap } from "@/lib/transcricao-whatsapp";
import { blocosDoDocumento, nomeDeArquivo, type ModoTranscricao, type OpcoesTranscricao, type ParteExport } from "@/lib/transcricao-formato";
import { docxDeBlocos, MIME_DOCX } from "@/lib/docx-simples";
import { compartilharComEmail, ensureSubfolder, getDriveSession, uploadBytes } from "@/lib/google-drive";

// Aba Transcrição: cada pessoa vê o histórico dela; admin vê o de todos (as
// regras do banco da migration 0038 garantem isso).

export type TranscricaoItem = {
  id: string;
  titulo: string;
  status: "enviando" | "processando" | "pronta" | "erro";
  modo: ModoTranscricao;
  duracao_seg: number | null;
  arquivo_nome: string | null;
  created_at: string;
  profile_id: string;
  dono?: string | null;
};
export type Transcricao = TranscricaoItem & { opcoes: OpcoesTranscricao; erro: string | null; texto: string | null; resumo: string | null; updated_at: string };

const UUID = /^[0-9a-f-]{36}$/i;
const db = async () => (await createClient()) as unknown as SupabaseClient;
const CAMPOS_LISTA = "id, titulo, status, modo, duracao_seg, arquivo_nome, created_at, profile_id, profiles(full_name)";

const comDono = (r: Record<string, unknown>) => {
  const { profiles, ...resto } = r as { profiles?: { full_name: string | null } | null };
  return { ...resto, dono: profiles?.full_name ?? null } as unknown as TranscricaoItem;
};

export async function listarTranscricoesAction(): Promise<TranscricaoItem[]> {
  await requireRole(["admin", "advogado"]);
  const { data } = await (await db()).from("transcricoes").select(CAMPOS_LISTA).order("created_at", { ascending: false }).limit(300);
  return (data ?? []).map(comDono);
}

export async function abrirTranscricaoAction(id: string): Promise<Transcricao | null> {
  await requireRole(["admin", "advogado"]);
  if (!UUID.test(id)) return null;
  const { data } = await (await db()).from("transcricoes").select(`*, profiles(full_name)`).eq("id", id).maybeSingle();
  return data ? (comDono(data) as Transcricao) : null;
}

/** Cria o registro e devolve o link para o navegador mandar o arquivo ao servidor de mídia. */
export async function criarTranscricaoAction(dados: {
  titulo: string;
  arquivoNome: string;
  modo: ModoTranscricao;
  opcoes: OpcoesTranscricao;
}): Promise<{ ok: true; id: string; envio: string } | { ok: false; erro: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const id = await novoRegistro(profile.id, dados);
  if (!id) return { ok: false, erro: "Não foi possível começar a transcrição." };
  try {
    return { ok: true, id, envio: linkDeEnvio(id) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Servidor de mídia indisponível." };
  }
}

async function novoRegistro(profileId: string, dados: { titulo: string; arquivoNome: string; modo: ModoTranscricao; opcoes: OpcoesTranscricao }): Promise<string | null> {
  const modo: ModoTranscricao = ["fiel", "resumo", "ambos"].includes(dados.modo) ? dados.modo : "ambos";
  const opcoes: OpcoesTranscricao = {
    falantes: !!dados.opcoes.falantes,
    tempo: !!dados.opcoes.tempo,
    instrucao: dados.opcoes.instrucao?.trim().slice(0, 600) || undefined,
  };
  const titulo = dados.titulo.trim().slice(0, 140) || dados.arquivoNome.replace(/\.[^.]+$/, "").slice(0, 140) || "Transcrição";
  const { data, error } = await (await db())
    .from("transcricoes")
    .insert({ profile_id: profileId, titulo, arquivo_nome: dados.arquivoNome.slice(0, 200), modo, opcoes })
    .select("id")
    .single();
  return error || !data ? null : data.id;
}

/* ───────── direto do WhatsApp do portal ───────── */

/** Áudios e vídeos do zap para escolher (mais recentes primeiro). */
export async function listarAudiosDoWhatsappAction(op: { busca?: string; antesDe?: string } = {}): Promise<AudioZap[]> {
  if (!(await temPermissao("whatsapp"))) return [];
  return listarAudiosDoWhatsapp(await createClient(), { busca: op.busca, antesDe: op.antesDe });
}

/** Cria a transcrição e já copia o áudio do zap para o servidor; depois o navegador chama /processar. */
export async function criarTranscricaoDoWhatsappAction(dados: {
  msgId: string;
  titulo: string;
  modo: ModoTranscricao;
  opcoes: OpcoesTranscricao;
}): Promise<{ ok: true; id: string; duracao: number } | { ok: false; erro: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  if (!(await temPermissao("whatsapp"))) return { ok: false, erro: "Você não tem acesso ao WhatsApp do escritório." };
  const achado = await audioDoWhatsapp(await createClient(), dados.msgId);
  if (!achado) return { ok: false, erro: "Não achei esse áudio no WhatsApp (ou ele ainda está sendo baixado)." };
  const { audio } = achado;
  const id = await novoRegistro(profile.id, {
    titulo: dados.titulo.trim() || tituloDoAudio(audio),
    arquivoNome: audio.nome || `${tituloDoAudio(audio)} (WhatsApp)`,
    modo: dados.modo,
    opcoes: dados.opcoes,
  });
  if (!id) return { ok: false, erro: "Não foi possível começar a transcrição." };
  try {
    return { ok: true, id, duracao: await importarDoWhatsapp(id, { path: achado.media_path, mime: achado.media_mime }) };
  } catch (e) {
    await (await db()).from("transcricoes").delete().eq("id", id);
    return { ok: false, erro: e instanceof Error ? e.message : "Não foi possível puxar o áudio do WhatsApp." };
  }
}

/** Salva o que a pessoa editou (título, transcrição, resumo). */
export async function salvarTranscricaoAction(id: string, campos: { titulo?: string; texto?: string; resumo?: string }): Promise<{ ok: boolean; erro?: string }> {
  await requireRole(["admin", "advogado"]);
  if (!UUID.test(id)) return { ok: false, erro: "Transcrição inválida." };
  const muda: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (campos.titulo !== undefined) muda.titulo = campos.titulo.trim().slice(0, 140) || "Transcrição";
  if (campos.texto !== undefined) muda.texto = campos.texto;
  if (campos.resumo !== undefined) muda.resumo = campos.resumo;
  const { error } = await (await db()).from("transcricoes").update(muda).eq("id", id);
  return error ? { ok: false, erro: "Não foi possível salvar." } : { ok: true };
}

export async function excluirTranscricaoAction(id: string): Promise<{ ok: boolean; erro?: string }> {
  await requireRole(["admin", "advogado"]);
  if (!UUID.test(id)) return { ok: false, erro: "Transcrição inválida." };
  const { error, count } = await (await db()).from("transcricoes").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { ok: false, erro: "Não foi possível excluir." };
  await apagarAudio(id);
  return { ok: true };
}

/** Resumo feito a partir do texto já transcrito (ou refeito com outra instrução). */
export async function gerarResumoAction(id: string, instrucao?: string): Promise<{ ok: true; resumo: string } | { ok: false; erro: string }> {
  await requireRole(["admin", "advogado"]);
  const t = await abrirTranscricaoAction(id);
  if (!t?.texto?.trim()) return { ok: false, erro: "Não há transcrição para resumir." };
  try {
    const resumo = await resumirTexto(t.texto, instrucao);
    await (await db()).from("transcricoes").update({ resumo, updated_at: new Date().toISOString() }).eq("id", id);
    return { ok: true, resumo };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao resumir." };
  }
}

/** Cria um Google Docs na pasta "Transcrições" do Drive do escritório e dá acesso a quem pediu. */
export async function abrirNoGoogleDocsAction(id: string, parte: ParteExport): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  const t = await abrirTranscricaoAction(id);
  if (!t) return { ok: false, erro: "Transcrição não encontrada." };
  try {
    const sessao = await getDriveSession();
    if (!sessao) return { ok: false, erro: "O Google Drive do escritório não está conectado (Integrações)." };
    const pasta = await ensureSubfolder(sessao.token, sessao.connection.root_folder_id, "Transcrições");
    const docId = await uploadBytes(sessao.token, {
      name: nomeDeArquivo(t.titulo, "docx").replace(/\.docx$/, ""),
      mimeType: MIME_DOCX,
      bytes: docxDeBlocos(blocosDoDocumento(t, parte)),
      parentId: pasta,
      converterPara: "application/vnd.google-apps.document",
    });
    if (profile.email && profile.email.toLowerCase() !== sessao.connection.account_email.toLowerCase()) {
      await compartilharComEmail(sessao.token, docId, profile.email).catch(() => {});
    }
    return { ok: true, url: `https://docs.google.com/document/d/${docId}/edit` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/invalid_grant|revoked|expired/i.test(msg)) return { ok: false, erro: "A autorização do Google Drive expirou. Reconecte em Integrações." };
    console.error("Transcrição → Google Docs:", msg);
    return { ok: false, erro: "Não foi possível criar o Google Docs agora." };
  }
}
