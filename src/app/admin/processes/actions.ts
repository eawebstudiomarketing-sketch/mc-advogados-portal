"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { PROCESS_AREAS } from "@/lib/process-area";
import type { Database } from "@/lib/supabase/types";

export type CreateProcessState = { error: string | null };

export async function createProcessAction(
  _prevState: CreateProcessState,
  formData: FormData
): Promise<CreateProcessState> {
  const profile = await requireRole(["admin", "advogado"]);

  const clientId = formData.get("client_id");
  const numeroProcesso = formData.get("numero_processo");
  const varaTribunal = formData.get("vara_tribunal");
  const area = formData.get("area");
  const fase = formData.get("fase");

  if (typeof clientId !== "string" || !clientId) {
    return { error: "Selecione o cliente." };
  }
  if (typeof numeroProcesso !== "string" || !numeroProcesso.trim()) {
    return { error: "Informe o número do processo." };
  }
  if (typeof area !== "string" || !PROCESS_AREAS.includes(area as never)) {
    return { error: "Selecione a área do processo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("processes").insert({
    client_id: clientId,
    numero_processo: numeroProcesso.trim(),
    vara_tribunal: typeof varaTribunal === "string" && varaTribunal.trim() ? varaTribunal.trim() : null,
    area: area as Database["public"]["Enums"]["process_area"],
    fase: typeof fase === "string" && fase.trim() ? fase.trim() : null,
    responsible_id: profile.id,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um processo cadastrado com esse número." };
    }
    return { error: "Não foi possível salvar o processo. Tente novamente." };
  }

  revalidatePath("/admin/processes");
  redirect("/admin/processes");
}
