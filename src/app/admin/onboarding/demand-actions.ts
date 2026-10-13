"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";
import type { DemandPriority } from "@/lib/onboarding-demands";
import { ACTIVITY_TYPES } from "@/lib/activity-type";
import type { Database } from "@/lib/supabase/types";

// Revisão dos rascunhos de demanda (gerados pelo Gemini na ficha do cliente:
// ver app/api/demandas/gerar). Nada vira atividade sem aprovação.

const PRIORITY_LABEL: Record<DemandPriority, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

type DraftFields = {
  title: string;
  priority: DemandPriority;
  activity_type: Database["public"]["Enums"]["activity_type"];
  deadline: string | null;
  action: string;
  reason: string;
  next_step: string;
};

function readDraftFields(formData: FormData): DraftFields | null {
  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const title = str("title");
  const priority = str("priority");
  const type = str("activity_type");
  const deadline = str("deadline");
  if (!title) return null;
  if (!["alta", "media", "baixa"].includes(priority)) return null;
  if (!ACTIVITY_TYPES.includes(type as never)) return null;
  return {
    title,
    priority: priority as DemandPriority,
    activity_type: type as DraftFields["activity_type"],
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
    action: str("action"),
    reason: str("reason"),
    next_step: str("next_step"),
  };
}

function idAndClient(formData: FormData): { id: string; clientId: string } | null {
  const id = formData.get("id");
  const clientId = formData.get("client_id");
  if (typeof id !== "string" || !id || typeof clientId !== "string" || !clientId) return null;
  return { id, clientId };
}

function revalidar(clientId: string) {
  revalidatePath(`/admin/clients/${clientId}`);
}

export async function saveDraftAction(formData: FormData): Promise<void> {
  await exigirPermissao("demandas");
  const ids = idAndClient(formData);
  const fields = readDraftFields(formData);
  if (!ids || !fields) return;

  const supabase = await createClient();
  await supabase
    .from("onboarding_demand_drafts")
    .update(fields)
    .eq("id", ids.id)
    .eq("status", "rascunho");

  revalidar(ids.clientId);
}

export async function discardDraftAction(formData: FormData): Promise<void> {
  await exigirPermissao("demandas");
  const ids = idAndClient(formData);
  if (!ids) return;

  const supabase = await createClient();
  await supabase
    .from("onboarding_demand_drafts")
    .update({ status: "descartada" })
    .eq("id", ids.id)
    .eq("status", "rascunho");

  revalidar(ids.clientId);
}

export async function approveDraftAction(formData: FormData): Promise<void> {
  const { profile: profile } = await exigirPermissao("demandas");
  const ids = idAndClient(formData);
  const fields = readDraftFields(formData);
  if (!ids || !fields) return;

  const supabase = await createClient();

  // Reserva o rascunho antes de criar a atividade: se o botão for clicado duas
  // vezes, só a primeira chamada encontra status 'rascunho' e cria a atividade.
  const { data: claimed } = await supabase
    .from("onboarding_demand_drafts")
    .update({ ...fields, status: "aprovada" })
    .eq("id", ids.id)
    .eq("status", "rascunho")
    .select("client_id, sources")
    .maybeSingle();
  if (!claimed) return;

  const fontes = Array.isArray(claimed.sources)
    ? (claimed.sources as { titulo?: string }[]).map((f) => f.titulo).filter(Boolean).join(", ")
    : "";

  const description = [
    `Prioridade: ${PRIORITY_LABEL[fields.priority]}`,
    fields.action && `Ação sugerida: ${fields.action}`,
    fields.reason && `Motivo: ${fields.reason}`,
    fields.next_step && `Próximo passo: ${fields.next_step}`,
    fontes ? `Origem: demanda gerada pela IA a partir de: ${fontes}.` : "Origem: demanda proativa gerada pela IA.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data: activity, error } = await supabase
    .from("activities")
    .insert({
      client_id: claimed.client_id,
      responsible_id: profile.id,
      title: fields.title,
      description,
      type: fields.activity_type,
      deadline: fields.deadline,
    })
    .select("id")
    .single();

  if (error || !activity) {
    // Não deixa o rascunho "aprovado" sem atividade: devolve pra revisão.
    await supabase.from("onboarding_demand_drafts").update({ status: "rascunho" }).eq("id", ids.id);
  } else {
    await supabase.from("onboarding_demand_drafts").update({ activity_id: activity.id }).eq("id", ids.id);
  }

  revalidar(ids.clientId);
  revalidatePath("/admin/activities");
}
