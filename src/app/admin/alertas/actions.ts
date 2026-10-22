"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao, temPermissao } from "@/lib/dal";
import { alertasDeAndamentos, alertasDePublicacoes } from "@/lib/data/alertas";
import { criarOrdem, statusAgente, telefoneDoJid } from "@/lib/whatsapp";

// Ações das abas de Alertas (Publicações e Andamentos), as mesmas do Astrea.
// Tudo fica no portal: nada é enviado ao Astrea.

const ids = (f: FormData, nome: string) => f.getAll(nome).filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v));
const um = (f: FormData, nome: string) => ids(f, nome)[0] ?? null;

function revalidar(processId?: string | null) {
  revalidatePath("/admin/alertas", "layout");
  revalidatePath("/admin/publicacoes");
  if (processId) revalidatePath(`/admin/processes/${processId}`);
}

/* ───────── aba Andamentos ───────── */

/** "Descartar alerta(s)": os andamentos não tratados desses processos saem dos alertas. */
export async function descartarAlertasAndamentosAction(formData: FormData): Promise<void> {
  const { profile } = await exigirPermissao("processos");
  const processos = ids(formData, "process_id");
  if (!processos.length) return;
  const supabase = await createClient();
  await supabase
    .from("andamentos")
    .update({ situacao: "descartado", tratado_por: profile.id, tratado_em: new Date().toISOString() })
    .in("process_id", processos)
    .eq("situacao", "novo");
  revalidar();
}

/** "Concluir" (e "Concluir e tratar o próximo"): os andamentos do alerta ficam tratados. */
export async function concluirAndamentosAction(formData: FormData): Promise<void> {
  const { profile } = await exigirPermissao("processos");
  const processId = um(formData, "process_id");
  if (!processId) return;
  const supabase = await createClient();
  await supabase
    .from("andamentos")
    .update({ situacao: "tratado", tratado_por: profile.id, tratado_em: new Date().toISOString() })
    .eq("process_id", processId)
    .eq("situacao", "novo");
  revalidar(processId);
  if (formData.get("proximo") === "1") {
    const proximo = (await alertasDeAndamentos())[0];
    if (proximo) redirect(`/admin/alertas/andamentos/${proximo.processo.id}`);
  }
  redirect("/admin/alertas?aba=andamentos");
}

/** Estrela: marca/desmarca o andamento como importante. */
export async function alternarImportanteAction(formData: FormData): Promise<void> {
  await exigirPermissao("processos");
  const id = um(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  const { data } = await supabase.from("andamentos").select("importante, process_id").eq("id", id).maybeSingle();
  if (!data) return;
  await supabase.from("andamentos").update({ importante: !data.importante }).eq("id", id);
  revalidar(data.process_id);
}

/* ───────── aba Publicações ───────── */

/** "Descartar alerta(s)": some dos alertas, mas a publicação continua na lista com a mesma situação. */
export async function descartarAlertasPublicacoesAction(formData: FormData): Promise<void> {
  await exigirPermissao("publicacoes");
  const lista = ids(formData, "id");
  if (!lista.length) return;
  const supabase = await createClient();
  await supabase.from("publicacoes").update({ alerta_descartado_em: new Date().toISOString() }).in("id", lista);
  revalidar();
}

/** "Descartar publicação" e "Concluir" (tratada). */
export async function situacaoPublicacaoAction(formData: FormData): Promise<void> {
  const { profile } = await exigirPermissao("publicacoes");
  const id = um(formData, "id");
  const status = String(formData.get("status"));
  if (!id || !["tratada", "descartada", "nao_tratada"].includes(status)) return;
  const supabase = await createClient();
  await supabase
    .from("publicacoes")
    .update(
      status === "nao_tratada"
        ? { status: "nao_tratada", tratada_por: null, tratada_em: null }
        : { status: status as "tratada" | "descartada", tratada_por: profile.id, tratada_em: new Date().toISOString() }
    )
    .eq("id", id);
  revalidar();
  const voltar = String(formData.get("voltar") ?? "");
  if (voltar === "proxima") {
    const proxima = (await alertasDePublicacoes())[0];
    redirect(proxima ? `/admin/alertas/publicacao/${proxima.id}` : "/admin/alertas");
  }
  if (voltar === "alertas") redirect("/admin/alertas");
}

/** ⋮ do quadro do processo: "Desvincular processo". */
export async function desvincularProcessoAction(formData: FormData): Promise<void> {
  await exigirPermissao("publicacoes");
  const id = um(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("publicacoes").update({ process_id: null, client_id: null }).eq("id", id);
  revalidar();
}

/** Tratamentos sugeridos: "Classificar sugestão como incorreta". */
export async function sugestaoIncorretaAction(formData: FormData): Promise<void> {
  await exigirPermissao("publicacoes");
  const id = um(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("publicacoes").update({ sugestao_incorreta: true }).eq("id", id);
  revalidar();
}

/* ───────── comuns ───────── */

/** Etiquetas (as do portal), em andamento ou publicação. */
export async function salvarEtiquetasAlertaAction(formData: FormData): Promise<void> {
  const andamento = um(formData, "andamento_id");
  const publicacao = um(formData, "publicacao_id");
  await exigirPermissao(andamento ? "processos" : "publicacoes");
  const nomes = formData.getAll("etiqueta").map(String).filter(Boolean);
  const supabase = await createClient();
  const { data: todas } = await supabase.from("etiquetas").select("nome, cor").in("nome", nomes.length ? nomes : ["-"]);
  const etiquetas = (todas ?? []).map((e) => ({ label: e.nome, color: e.cor }));
  if (andamento) await supabase.from("andamentos").update({ etiquetas }).eq("id", andamento);
  if (publicacao) await supabase.from("publicacoes").update({ etiquetas }).eq("id", publicacao);
  revalidar();
}

export type AcaoState = { ok: boolean; erro: string | null };

/** "Adicionar comentário". */
export async function comentarAlertaAction(_prev: AcaoState, formData: FormData): Promise<AcaoState> {
  const andamento = um(formData, "andamento_id");
  const publicacao = um(formData, "publicacao_id");
  const { profile } = await exigirPermissao(andamento ? "processos" : "publicacoes");
  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) return { ok: false, erro: "Escreva o comentário." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("alerta_comentarios")
    .insert({ andamento_id: andamento, publicacao_id: publicacao, autor_id: profile.id, autor_nome: profile.full_name, texto: texto.slice(0, 4000) });
  if (error) return { ok: false, erro: "Não foi possível salvar o comentário." };
  if (andamento) await marcarAcao(andamento, "Comentário adicionado", profile.id);
  revalidar();
  return { ok: true, erro: null };
}

/** "Adicionar histórico manual": registro no histórico do processo (como no Astrea). */
export async function historicoManualAction(_prev: AcaoState, formData: FormData): Promise<AcaoState> {
  const { profile } = await exigirPermissao("processos");
  const processId = um(formData, "process_id");
  const andamento = um(formData, "andamento_id");
  const texto = String(formData.get("texto") ?? "").trim();
  if (!processId) return { ok: false, erro: "Esta publicação não está ligada a um processo do portal." };
  if (!texto) return { ok: false, erro: "Escreva o histórico." };
  const dia = String(formData.get("data") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("andamentos").insert({
    process_id: processId,
    data: /^\d{4}-\d{2}-\d{2}$/.test(dia) ? new Date(`${dia}T12:00:00-03:00`).toISOString() : new Date().toISOString(),
    descricao: texto.slice(0, 8000),
    tipo: "nota",
    fonte: "manual",
    situacao: "historico",
    responsavel_nome: profile.full_name,
  });
  if (error) return { ok: false, erro: "Não foi possível salvar o histórico." };
  if (andamento) await marcarAcao(andamento, "Histórico manual adicionado", profile.id);
  revalidar(processId);
  return { ok: true, erro: null };
}

async function marcarAcao(andamentoId: string, acao: string, perfil: string) {
  const supabase = await createClient();
  await supabase.from("andamentos").update({ acao, acao_em: new Date().toISOString(), acao_por: perfil }).eq("id", andamentoId);
}

/* ───────── Compartilhar via WhatsApp ───────── */

export type DestinoZap = { jid: string; nome: string; grupo: boolean; sugerido: boolean };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function prepararCompartilharAction(clientId: string | null): Promise<{ ok: true; destinos: DestinoZap[]; agenteNoAr: boolean } | { ok: false; erro: string }> {
  await exigirPermissao("processos");
  if (!(await temPermissao("whatsapp"))) return { ok: false, erro: "Você não tem acesso ao WhatsApp do escritório." };
  const db = await createClient();
  const [{ data: chats }, agente] = await Promise.all([
    clientId
      ? db.from("wa_chats").select("chat_jid, nome, is_group").eq("client_id", clientId).order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(20)
      : Promise.resolve({ data: [] as { chat_jid: string; nome: string | null; is_group: boolean }[] }),
    statusAgente(db),
  ]);
  const lista = chats ?? [];
  const sugerido = lista.find((c) => c.is_group && /assessoria\s+juridica/.test(semAcento(c.nome ?? ""))) ?? lista[0];
  return {
    ok: true,
    destinos: lista.map((c) => ({ jid: c.chat_jid, nome: c.nome || telefoneDoJid(c.chat_jid), grupo: c.is_group, sugerido: c.chat_jid === sugerido?.chat_jid })),
    agenteNoAr: !!agente?.ligado,
  };
}

export async function buscarConversaAction(termo: string): Promise<DestinoZap[]> {
  await exigirPermissao("whatsapp");
  const t = termo.replace(/[%_,()]/g, " ").trim();
  if (t.length < 2) return [];
  const db = await createClient();
  const dig = t.replace(/\D/g, "");
  const q = db.from("wa_chats").select("chat_jid, nome, is_group").limit(8);
  const { data } = await (dig.length >= 6 ? q.like("chat_jid", `%${dig}%`) : q.ilike("nome", `%${t}%`)).order("ultima_msg_em", { ascending: false, nullsFirst: false });
  return (data ?? []).map((c) => ({ jid: c.chat_jid, nome: c.nome || telefoneDoJid(c.chat_jid), grupo: c.is_group, sugerido: false }));
}

export async function compartilharNoZapAction(jid: string, texto: string, andamentoId: string | null): Promise<AcaoState> {
  const { profile } = await exigirPermissao("whatsapp");
  const t = texto.trim();
  if (!jid || !t) return { ok: false, erro: "Escolha a conversa e escreva a mensagem." };
  const db = await createClient();
  const agente = await statusAgente(db);
  if (!agente?.ligado) return { ok: false, erro: "O WhatsApp do escritório está fora do ar agora." };
  await criarOrdem(db, { tipo: "enviar_mensagem", payload: { para: jid, texto: t, quem: "humano" }, chat_jid: jid, criado_por: profile.id });
  if (andamentoId && /^[0-9a-f-]{36}$/i.test(andamentoId)) await marcarAcao(andamentoId, "Compartilhado via WhatsApp", profile.id);
  revalidar();
  return { ok: true, erro: null };
}
