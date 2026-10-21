"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao, requireRole } from "@/lib/dal";
import type { ResultadoSync } from "@/lib/andamentos/sync";

/** Marca os andamentos novos de um processo (ou ids soltos) como tratados/descartados, ou volta para não tratado. */
export async function mudarSituacaoAndamentosAction(formData: FormData): Promise<void> {
  const { profile } = await exigirPermissao("processos");
  const situacao = String(formData.get("situacao"));
  if (!["tratado", "descartado", "novo"].includes(situacao)) return;
  const processIds = formData.getAll("process_id").filter((v): v is string => typeof v === "string" && !!v);
  const ids = formData.getAll("id").filter((v): v is string => typeof v === "string" && !!v);
  if (!processIds.length && !ids.length) return;
  const supabase = await createClient();
  const campos =
    situacao === "novo"
      ? { situacao: "novo" as const, tratado_por: null, tratado_em: null }
      : { situacao: situacao as "tratado" | "descartado", tratado_por: profile.id, tratado_em: new Date().toISOString() };
  let q = supabase.from("andamentos").update(campos);
  q = ids.length ? q.in("id", ids) : q.in("process_id", processIds).in("situacao", situacao === "novo" ? ["tratado", "descartado"] : ["novo"]);
  await q;
  revalidatePath("/admin/andamentos");
}

export type LerAgoraState = { msg: string | null; erro: boolean };

/** Lê o Astrea agora (mesma rota do agendamento). */
export async function lerAndamentosAgoraAction(_prev: LerAgoraState, _f: FormData): Promise<LerAgoraState> {
  await requireRole(["admin"]);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br").replace(/\/$/, "");
  let r: ResultadoSync;
  try {
    const resp = await fetch(`${base}/api/cron/andamentos?origem=manual`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, cache: "no-store" });
    r = (await resp.json()) as ResultadoSync;
  } catch {
    return { msg: "Não foi possível falar com o robô de andamentos. Tente de novo.", erro: true };
  }
  revalidatePath("/admin/andamentos");
  if (r.erro) return { msg: r.erro, erro: true };
  return {
    msg: r.novos ? `${r.novos} andamento(s) novo(s) em ${r.processos} processo(s) lido(s).` : `Nenhum andamento novo (${r.processos} processo(s) conferido(s)).`,
    erro: false,
  };
}
