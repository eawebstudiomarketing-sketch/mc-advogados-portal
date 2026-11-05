"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehSuperAdmin, exigirSuperAdmin, requireRole } from "@/lib/dal";
import { cancelarPedidoPrazo, decidirPedidoPrazo, pedirMudancaPrazo } from "@/lib/prazo-pedidos";

// Pedido de mudança de prazo (05/11/2026): a equipe pede, o Dr. Maurício decide.

type R = { ok: true; aplicado?: boolean } | { ok: false; error: string };

function atualizar() {
  revalidatePath("/admin/activities");
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/alertas");
  revalidatePath("/admin", "layout");
}

export async function pedirPrazoAction(activityId: string, prazoNovo: string | null, justificativa: string): Promise<R> {
  const profile = await requireRole(["admin", "advogado"]);
  // só pede para atividade que a pessoa enxerga (regras do banco)
  const supabase = await createClient();
  const { data: a } = await supabase.from("activities").select("id").eq("id", activityId).maybeSingle();
  if (!a) return { ok: false, error: "Atividade não encontrada." };
  if (ehSuperAdmin(profile)) {
    // o próprio Maurício não precisa pedir: muda direto
    const { error } = await supabase.from("activities").update({ deadline: prazoNovo }).eq("id", activityId);
    if (error) return { ok: false, error: "Não foi possível mudar o prazo." };
    atualizar();
    return { ok: true, aplicado: true };
  }
  const r = await pedirMudancaPrazo({ profileId: profile.id, nome: profile.full_name.split(" ")[0] ?? profile.full_name, activityId, prazoNovo, justificativa });
  if (r.ok) atualizar();
  return r;
}

export async function cancelarPedidoPrazoAction(pedidoId: string): Promise<R> {
  const profile = await requireRole(["admin", "advogado"]);
  if (!(await cancelarPedidoPrazo(profile.id, pedidoId))) return { ok: false, error: "Pedido não encontrado ou já decidido." };
  atualizar();
  return { ok: true };
}

export async function decidirPrazoAction(pedidoId: string, aprovar: boolean, resposta?: string): Promise<R> {
  const profile = await exigirSuperAdmin();
  const r = await decidirPedidoPrazo({ decididoPor: profile.id, pedidoId, aprovar, resposta });
  if (r.ok) atualizar();
  return r;
}
