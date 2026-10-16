"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import { reagendarLembretes, cancelarLembretes } from "@/lib/zap/lembretes";
import { criarAvisos } from "@/lib/avisos";
import { createAdminClient } from "@/lib/supabase/admin";

// Compromissos da agenda (reunião, ligação, evento). Ao salvar, os lembretes
// do cliente no WhatsApp (24h e 1h antes) são refeitos.

export type CompromissoState = { error: string | null };

const TIPOS = ["reuniao", "ligacao", "evento", "outro"];
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

  await reagendarLembretes({ id: salvoId, titulo, inicio: dados.inicio, local: dados.local, client_id: clientId, lembrar_cliente: dados.lembrar_cliente }, profile.id);

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

  revalidatePath("/admin/agenda");
  revalidatePath("/admin");
  redirect(`/admin/agenda?mes=${dia.slice(0, 7)}&salvo=${salvoId}`);
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
