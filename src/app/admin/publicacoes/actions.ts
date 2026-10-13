"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao, requireRole } from "@/lib/dal";
import { executarMonitor } from "@/lib/publicacoes/monitor";

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

export type BuscaState = { msg: string | null; erro: boolean };

export async function buscarAgoraAction(_prev: BuscaState, _formData: FormData): Promise<BuscaState> {
  await requireRole(["admin"]);
  const r = await executarMonitor("manual");
  revalidatePath("/admin/publicacoes");
  if (r.erro) return { msg: r.erro, erro: true };
  return {
    msg: r.novas
      ? `${r.novas} publicação(ões) nova(s) de ${r.encontradas} encontrada(s).${r.emailPara ? ` Aviso enviado para ${r.emailPara}.` : ""}`
      : `Nenhuma publicação nova (${r.encontradas} encontrada(s), todas já estavam aqui).`,
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
