"use server";

import { revalidatePath } from "next/cache";
import { updateActivityStatusAction } from "./actions";

// Mudar o status da atividade de qualquer lista (Agenda, Área de trabalho, Meu dia),
// 04/11/2026: Em andamento ou Concluída. Concluída sai sozinha da agenda (as listas
// só mostram as abertas). As regras do banco decidem quem pode mudar.
export async function statusRapidoAction(id: string, status: "em_andamento" | "concluida" | "aberta"): Promise<{ ok: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["em_andamento", "concluida", "aberta"].includes(status)) return { ok: false };
  const fd = new FormData();
  fd.set("id", id);
  fd.set("status", status);
  await updateActivityStatusAction(fd);
  revalidatePath("/admin/agenda");
  return { ok: true };
}
