"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { getClient } from "@/lib/data/clients";
import { OnboardingDocument } from "@/lib/pdf/onboarding";
import { ONBOARDING_STAGES, type OnboardingAnswers } from "@/lib/onboarding-schema";
import type { Database } from "@/lib/supabase/types";

export type SaveOnboardingState = { error: string | null };

export async function saveOnboardingAction(
  _prevState: SaveOnboardingState,
  formData: FormData
): Promise<SaveOnboardingState> {
  const profile = await requireRole(["admin"]);

  const clientId = formData.get("client_id");
  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }

  const client = await getClient(clientId);
  if (!client) return { error: "Cliente não encontrado." };

  const answers: OnboardingAnswers = {};
  for (const stage of ONBOARDING_STAGES) {
    for (const question of stage.questions) {
      const value = formData.get(question.id);
      if (typeof value === "string" && value.trim()) {
        answers[question.id] = value.trim();
      }
    }
  }

  const pdfBuffer = await renderToBuffer(<OnboardingDocument clientName={client.name} answers={answers} />);

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
    pdf_url: filePath,
  } satisfies Database["public"]["Tables"]["onboardings"]["Insert"]);
  if (insertError) {
    await supabase.storage.from("documents").remove([filePath]);
    return { error: "PDF gerado, mas não foi possível salvar o registro. Tente novamente." };
  }

  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/clients/${clientId}`);
  redirect("/admin/onboarding");
}

export async function deleteOnboardingAction(formData: FormData): Promise<void> {
  await requireRole(["admin"]);

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
