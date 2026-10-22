"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal";
import type { ResultadoSync } from "@/lib/andamentos/sync";

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
  revalidatePath("/admin/alertas", "layout");
  if (r.erro) return { msg: r.erro, erro: true };
  return {
    msg: r.novos ? `${r.novos} andamento(s) novo(s) em ${r.processos} processo(s) lido(s).` : `Nenhum andamento novo (${r.processos} processo(s) conferido(s)).`,
    erro: false,
  };
}
