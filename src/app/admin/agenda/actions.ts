"use server";

import { redirect } from "next/navigation";
import { destinoDeVolta } from "@/lib/voltar";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import { reagendarLembretes, cancelarLembretes, reagendarAudienciaDaAtividade } from "@/lib/zap/lembretes";
import { criarAvisos } from "@/lib/avisos";
import { createAdminClient } from "@/lib/supabase/admin";

// Compromissos da agenda (reunião, ligação, evento). Ao salvar, os lembretes
// do cliente no WhatsApp (24h e 1h antes) são refeitos.

export type CompromissoState = { error: string | null };

const TIPOS = ["reuniao", "audiencia", "ligacao", "evento", "outro"];
const texto = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export async function salvarCompromissoAction(_prev: CompromissoState, formData: FormData): Promise<CompromissoState> {
  const { profile } = await exigirPermissao("agenda");
  const id = texto(formData.get("id"));
  const titulo = texto(formData.get("titulo"));
  const tipo = texto(formData.get("tipo"));
  const dia = texto(formData.get("dia"));
  const hora = texto(formData.get("hora"));
  const horaFim = texto(formData.get("hora_fim"));
  const clientId = texto(formData.get("client_id")) || null;
  const participantes = formData.getAll("participantes").map(String).filter(Boolean);

  if (!titulo) return { error: "Informe o título." };
  if (!TIPOS.includes(tipo)) return { error: "Escolha o tipo." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) return { error: "Informe o dia e a hora." };
  if (horaFim && !/^\d{2}:\d{2}$/.test(horaFim)) return { error: "Hora de término inválida." };
  if (horaFim && horaFim <= hora) return { error: "O término precisa ser depois do início." };

  const dados = {
    titulo,
    tipo,
    inicio: new Date(`${dia}T${hora}:00-03:00`).toISOString(),
    fim: horaFim ? new Date(`${dia}T${horaFim}:00-03:00`).toISOString() : null,
    local: texto(formData.get("local")) || null,
    descricao: texto(formData.get("descricao")) || null,
    client_id: clientId,
    participantes,
    lembrar_cliente: formData.get("lembrar_cliente") === "on",
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  let salvoId = id;
  let antes: string[] = [];
  if (id) {
    const { data: anterior } = await supabase.from("compromissos").select("participantes").eq("id", id).maybeSingle();
    antes = anterior?.participantes ?? [];
    const { error } = await supabase.from("compromissos").update(dados).eq("id", id);
    if (error) return { error: "Não foi possível salvar o compromisso." };
  } else {
    const { data, error } = await supabase.from("compromissos").insert({ ...dados, criado_por: profile.id }).select("id").single();
    if (error || !data) return { error: "Não foi possível criar o compromisso." };
    salvoId = data.id;
  }

  await reagendarLembretes({ id: salvoId, tipo, criacao: !id, titulo, inicio: dados.inicio, local: dados.local, client_id: clientId, lembrar_cliente: dados.lembrar_cliente }, profile.id);

  // aviso para quem entrou agora no compromisso (menos quem criou)
  const novos = participantes.filter((p) => !antes.includes(p));
  if (novos.length) {
    const { data: perfis } = await createAdminClient().from("responsaveis").select("profile_id").in("id", novos);
    const quando = new Date(dados.inicio).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    await criarAvisos(
      (perfis ?? [])
        .map((p) => p.profile_id)
        .filter((p): p is string => !!p && p !== profile.id)
        .map((p) => ({ profile_id: p, tipo: "compromisso", titulo: `Você está em: ${titulo}`, corpo: quando, url: `/admin/agenda/compromisso/${salvoId}` }))
    ).catch(() => undefined);
  }

  // veio do "Tratar andamento ▾": o andamento fica como tratado
  const andamentoId = texto(formData.get("andamento_id"));
  if (/^[0-9a-f-]{36}$/i.test(andamentoId)) {
    await supabase.from("andamentos").update({ acao: "Evento adicionado", acao_em: new Date().toISOString(), acao_por: profile.id }).eq("id", andamentoId);
    revalidatePath("/admin/alertas", "layout");
  }

  revalidatePath("/admin/agenda");
  revalidatePath("/admin");
  redirect(destinoDeVolta(formData, `/admin/agenda?mes=${dia.slice(0, 7)}&salvo=${salvoId}`));
}

export async function excluirCompromissoAction(formData: FormData): Promise<void> {
  await exigirPermissao("agenda");
  const id = texto(formData.get("id"));
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase.from("compromissos").delete().eq("id", id);
  if (!error) await cancelarLembretes(id);
  revalidatePath("/admin/agenda");
  redirect("/admin/agenda");
}

/**
 * Arrastar na agenda do mês (item 23 da auditoria, 30/10/2026): muda o dia de
 * uma atividade (prazo) ou de um compromisso (mantém o horário). Os lembretes
 * do WhatsApp são refeitos como numa edição normal.
 */
export async function remarcarNaAgendaAction(tipo: "atividade" | "compromisso", id: string, dia: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { profile } = await exigirPermissao("agenda");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { ok: false, error: "Dados inválidos." };
  const supabase = await createClient();

  if (tipo === "atividade") {
    const { data, error } = await supabase.from("activities").update({ deadline: dia }).eq("id", id).select("id");
    if (error || !data?.length) return { ok: false, error: "Não foi possível remarcar a atividade." };
    await reagendarAudienciaDaAtividade(id).catch(() => undefined);
    revalidatePath("/admin/activities");
  } else {
    const { data: c } = await supabase.from("compromissos").select("id, tipo, titulo, inicio, fim, local, client_id, lembrar_cliente").eq("id", id).maybeSingle();
    if (!c) return { ok: false, error: "Compromisso não encontrado." };
    const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const inicio = new Date(`${dia}T${hora(c.inicio)}:00-03:00`).toISOString();
    const fim = c.fim ? new Date(Date.parse(c.fim) + (Date.parse(inicio) - Date.parse(c.inicio))).toISOString() : null;
    const { error } = await supabase.from("compromissos").update({ inicio, fim, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return { ok: false, error: "Não foi possível remarcar o compromisso." };
    await reagendarLembretes({ id, tipo: c.tipo, criacao: false, titulo: c.titulo, inicio, local: c.local, client_id: c.client_id, lembrar_cliente: c.lembrar_cliente }, profile.id).catch(() => undefined);
  }
  revalidatePath("/admin/agenda");
  revalidatePath("/admin");
  return { ok: true };
}
