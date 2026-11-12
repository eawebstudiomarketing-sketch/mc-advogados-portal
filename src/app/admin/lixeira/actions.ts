"use server";

import { revalidatePath } from "next/cache";
import { exigirPermissao } from "@/lib/dal";
import { restaurarAtividade } from "@/lib/lixeira-atividades";

// Lixeira de atividades (12/11/2026): restaurar devolve a atividade com
// comentários, anexos e ligações (publicação, andamento, Distribuição…).
export async function restaurarAtividadeAction(id: string): Promise<{ error: string | null }> {
  await exigirPermissao("lixeira");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "Atividade inválida." };
  const error = await restaurarAtividade(id);
  revalidatePath("/admin/lixeira");
  revalidatePath("/admin/activities");
  return { error };
}
