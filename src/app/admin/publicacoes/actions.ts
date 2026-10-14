"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao, requireRole } from "@/lib/dal";
import type { ResultadoMonitor } from "@/lib/publicacoes/monitor";
import { enviarPush } from "@/lib/push";

const STATUS = ["nao_tratada", "tratada", "descartada"] as const;

export async function mudarStatusPublicacaoAction(formData: FormData): Promise<void> {
  const { profile } = await exigirPermissao("publicacoes");
  const id = formData.get("id");
  const status = formData.get("status");
  if (typeof id !== "string" || !id || !STATUS.includes(status as never)) return;

  const supabase = await createClient();
  await supabase
    .from("publicacoes")
    .update(
      status === "nao_tratada"
        ? { status, tratada_por: null, tratada_em: null }
        : { status: status as (typeof STATUS)[number], tratada_por: profile.id, tratada_em: new Date().toISOString() }
    )
    .eq("id", id);
  revalidatePath("/admin/publicacoes");
}

/** Ações em massa: marca várias publicações de uma vez (tratadas ou descartadas). */
export async function mudarStatusEmLoteAction(formData: FormData): Promise<void> {
  const { profile } = await exigirPermissao("publicacoes");
  const status = formData.get("status");
  const ids = formData.getAll("ids").filter((v): v is string => typeof v === "string" && !!v);
  if (!ids.length || (status !== "tratada" && status !== "descartada")) return;
  const supabase = await createClient();
  await supabase
    .from("publicacoes")
    .update({ status, tratada_por: profile.id, tratada_em: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "nao_tratada");
  revalidatePath("/admin/publicacoes");
}

export type BuscaState = { msg: string | null; erro: boolean };

export async function buscarAgoraAction(_prev: BuscaState, _formData: FormData): Promise<BuscaState> {
  await requireRole(["admin"]);
  // Chama a rota do robô (que roda em São Paulo) em vez de buscar daqui.
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br").replace(/\/$/, "");
  let r: ResultadoMonitor;
  try {
    const resp = await fetch(`${base}/api/cron/publicacoes?origem=manual`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: "no-store",
    });
    r = (await resp.json()) as ResultadoMonitor;
  } catch {
    return { msg: "Não foi possível falar com o robô de publicações. Tente de novo.", erro: true };
  }
  revalidatePath("/admin/publicacoes");
  if (r.erro) return { msg: r.erro, erro: true };
  return {
    msg: r.novas || r.inpiNovas
      ? `${r.novas} publicação(ões) nova(s) de ${r.encontradas} encontrada(s) no DJEN${r.inpiNovas ? ` e ${r.inpiNovas} do INPI` : ""}.${r.emailPara ? ` Aviso enviado para ${r.emailPara}.` : ""}`
      : `Nenhuma publicação nova (${r.encontradas} encontrada(s), todas já estavam aqui).${r.inpiRevista ? ` INPI: revista nº ${r.inpiRevista} lida.` : ""}`,
    erro: false,
  };
}

export async function adicionarOabAction(formData: FormData): Promise<void> {
  await requireRole(["admin"]);
  const numero = String(formData.get("numero") ?? "").replace(/\D/g, "");
  const uf = String(formData.get("uf") ?? "").trim().toUpperCase();
  const nome = String(formData.get("nome") ?? "").trim();
  if (!numero || !/^[A-Z]{2}$/.test(uf)) return;
  const supabase = await createClient();
  await supabase.from("monitor_oabs").upsert({ numero, uf, nome: nome || null, ativo: true }, { onConflict: "numero,uf" });
  revalidatePath("/admin/publicacoes");
}

export async function alternarOabAction(formData: FormData): Promise<void> {
  await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  const ativo = formData.get("ativo") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("monitor_oabs").update({ ativo }).eq("id", id);
  revalidatePath("/admin/publicacoes");
}

export async function removerOabAction(formData: FormData): Promise<void> {
  await requireRole(["admin"]);
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("monitor_oabs").delete().eq("id", id);
  revalidatePath("/admin/publicacoes");
}

export async function salvarEmailAlertaAction(formData: FormData): Promise<void> {
  await requireRole(["admin"]);
  const email = String(formData.get("email") ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const supabase = await createClient();
  await supabase.from("monitor_config").upsert({ id: 1, email_alerta: email || null, updated_at: new Date().toISOString() });
  revalidatePath("/admin/publicacoes");
}

export async function salvarProcuradoresInpiAction(formData: FormData): Promise<void> {
  await requireRole(["admin"]);
  const nomes = String(formData.get("procuradores") ?? "")
    .split(/\r?\n/)
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 10);
  const supabase = await createClient();
  await supabase.from("monitor_config").upsert({ id: 1, inpi_procuradores: nomes, updated_at: new Date().toISOString() });
  revalidatePath("/admin/publicacoes");
}

// ---------- aviso no celular (Web Push) ----------

export async function salvarInscricaoPushAction(insc: { endpoint: string; p256dh: string; auth: string; aparelho: string }): Promise<{ ok: boolean }> {
  const profile = await requireRole(["admin"]);
  if (!insc.endpoint?.startsWith("https://") || !insc.p256dh || !insc.auth) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_inscricoes")
    .upsert({ profile_id: profile.id, endpoint: insc.endpoint, p256dh: insc.p256dh, auth: insc.auth, aparelho: insc.aparelho.slice(0, 120) }, { onConflict: "endpoint" });
  return { ok: !error };
}

export async function removerInscricaoPushAction(endpoint: string): Promise<void> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  await supabase.from("push_inscricoes").delete().eq("endpoint", endpoint);
}

export async function testarPushAction(): Promise<{ enviados: number }> {
  const profile = await requireRole(["admin"]);
  const enviados = await enviarPush([profile.id], {
    titulo: "Teste do portal MC",
    corpo: "Os avisos de publicações novas vão chegar assim.",
    url: "/admin/publicacoes",
    tag: "teste",
  });
  return { enviados };
}
