"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { requireRole, exigirPermissao } from "@/lib/dal";
import { autoExportPdf } from "@/lib/drive-sync";
import { getClient } from "@/lib/data/clients";
import { OnboardingDocument } from "@/lib/pdf/onboarding";
import { ONBOARDING_STAGES, type OnboardingAnswers } from "@/lib/onboarding-schema";
import { stagesFromStored, toStored } from "@/lib/onboarding-stages";
import { generateOnboardingStages } from "@/lib/onboarding-ai";
import { handoffParaTexto } from "@/lib/handoff-schema";
import { getHandoff } from "@/lib/data/handoff";
import type { OnboardingStage } from "@/lib/onboarding-schema";
import type { Database } from "@/lib/supabase/types";
import { destinoDeVolta } from "@/lib/voltar";

export type SaveOnboardingState = { error: string | null };

export async function saveOnboardingAction(
  _prevState: SaveOnboardingState,
  formData: FormData
): Promise<SaveOnboardingState> {
  const { profile: profile } = await exigirPermissao("onboarding");

  const clientId = formData.get("client_id");
  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }

  const client = await getClient(clientId);
  if (!client) return { error: "Cliente não encontrado." };

  // As perguntas usadas (padrão ou do Gemini, com as que a pessoa editou ou
  // adicionou na tela) chegam em JSON e ficam salvas junto das respostas.
  let personalizadas: OnboardingStage[] | null = null;
  const rawQuestions = formData.get("questions");
  if (typeof rawQuestions === "string" && rawQuestions) {
    try {
      personalizadas = stagesFromStored(JSON.parse(rawQuestions));
    } catch {
      return { error: "As perguntas do onboarding estão inválidas. Gere de novo." };
    }
  }
  const stages = personalizadas ?? ONBOARDING_STAGES;

  const answers: OnboardingAnswers = {};
  for (const stage of stages) {
    for (const question of stage.questions) {
      const value = formData.get(question.id);
      if (typeof value === "string" && value.trim()) {
        answers[question.id] = value.trim();
      }
    }
  }

  const pdfBuffer = await renderToBuffer(<OnboardingDocument clientName={client.name} answers={answers} stages={stages} />);

  const supabase = await createClient();
  const filePath = `${clientId}/onboarding/${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(filePath, pdfBuffer, { contentType: "application/pdf" });
  if (uploadError) {
    return { error: "Não foi possível salvar o PDF gerado. Tente novamente." };
  }

  const { error: insertError } = await supabase.from("onboardings").insert({
    client_id: clientId,
    created_by: profile.id,
    answers,
    questions: personalizadas ? toStored(personalizadas) : null,
    pdf_url: filePath,
  } satisfies Database["public"]["Tables"]["onboardings"]["Insert"]);
  if (insertError) {
    await supabase.storage.from("documents").remove([filePath]);
    return { error: "PDF gerado, mas não foi possível salvar o registro. Tente novamente." };
  }

  // perguntas novas marcadas como "usar também nos próximos onboardings"
  try {
    const marcadas = JSON.parse(String(formData.get("perguntas_modelo") ?? "[]")) as { stage_id?: unknown; texto?: unknown }[];
    const etapasValidas = new Set(ONBOARDING_STAGES.map((s) => s.id));
    const novas = (Array.isArray(marcadas) ? marcadas : [])
      .filter((m) => typeof m.stage_id === "string" && etapasValidas.has(m.stage_id) && typeof m.texto === "string" && m.texto.trim())
      .slice(0, 50)
      .map((m) => ({ stage_id: m.stage_id as string, texto: (m.texto as string).trim().slice(0, 500), created_by: profile.id }));
    if (novas.length) await supabase.from("onboarding_perguntas_modelo").insert(novas);
  } catch {}

  await autoExportPdf(profile.id, "onboarding", clientId);

  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/clients/${clientId}`);
  redirect(destinoDeVolta(formData, "/admin/onboarding"));
}

export type GenerateQuestionsResult = { ok: true; stages: OnboardingStage[] } | { ok: false; error: string };

// Lê a triagem do cliente e pede ao Gemini as perguntas de cada etapa.
export async function generateOnboardingQuestionsAction(clientId: string): Promise<GenerateQuestionsResult> {
  await exigirPermissao("onboarding", "gerar_ia");
  const client = await getClient(clientId);
  if (!client) return { ok: false, error: "Cliente não encontrado." };
  const ficha = await getHandoff(clientId);
  const base = handoffParaTexto(ficha.handoff, ficha.triagem);
  if (!base.trim()) {
    return { ok: false, error: "Este cliente ainda não tem a Ficha de Handoff preenchida. Preencha a ficha primeiro." };
  }
  const result = await generateOnboardingStages({ name: client.name, tipo_pessoa: client.tipo_pessoa, triagem: base });
  return result.ok ? { ok: true, stages: result.data } : result;
}

export async function deleteOnboardingAction(formData: FormData): Promise<void> {
  await exigirPermissao("onboarding", "excluir");

  const id = formData.get("id");
  const clientId = formData.get("client_id");
  const pdfUrl = formData.get("pdf_url");
  if (typeof id !== "string" || !id) return;

  const supabase = await createClient();
  await supabase.from("onboardings").delete().eq("id", id);
  if (typeof pdfUrl === "string" && pdfUrl) {
    await supabase.storage.from("documents").remove([pdfUrl]);
  }

  revalidatePath("/admin/onboarding");
  if (typeof clientId === "string" && clientId) {
    revalidatePath(`/admin/clients/${clientId}`);
  }
}

export async function deletePerguntaModeloAction(formData: FormData): Promise<void> {
  await requireRole(["admin"]);
  const id = formData.get("id");
  if (typeof id !== "string" || !id) return;
  const supabase = await createClient();
  await supabase.from("onboarding_perguntas_modelo").delete().eq("id", id);
  revalidatePath("/admin/onboarding");
}
