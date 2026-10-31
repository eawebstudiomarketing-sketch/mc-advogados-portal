"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarAvisos } from "@/lib/avisos";
import { idsDosAdmins } from "@/lib/push";
import { respondidas, totalPerguntas, type Respostas, type Secao } from "@/lib/regimentos/tipos";

// Link público do Regimento Interno (sem login): a empresa salva o que já
// respondeu e envia. Quem tem o link responde; o token é o próprio acesso.

type Resultado = { ok: true } | { ok: false; error: string };
const db = () => createAdminClient() as unknown as SupabaseClient;
const tokenValido = (t: string) => /^[0-9a-f]{32}$/.test(t);

/** Mantém só respostas das perguntas que existem, com tamanho limitado. */
function limpar(secoes: Secao[], r: Respostas): Respostas {
  const out: Respostas = {};
  for (const s of secoes)
    for (const p of s.perguntas) {
      const v = r[p.id];
      if (Array.isArray(v)) out[p.id] = v.slice(0, 50).map((x) => String(x).slice(0, 2000));
      else if (typeof v === "string" && v) out[p.id] = v.slice(0, 20_000);
    }
  return out;
}

async function carregar(token: string) {
  if (!tokenValido(token)) return null;
  const { data } = await db().from("regimentos").select("id, client_id, titulo, secoes, aceitando, status, criado_por").eq("token", token).maybeSingle();
  return data as { id: string; client_id: string | null; titulo: string; secoes: Secao[]; aceitando: boolean; status: string; criado_por: string | null } | null;
}

export async function salvarRascunhoAction(token: string, respostas: Respostas): Promise<Resultado> {
  const r = await carregar(token);
  if (!r) return { ok: false, error: "Link inválido." };
  if (!r.aceitando || r.status === "respondido") return { ok: false, error: "Este formulário não está mais aceitando respostas." };
  await db()
    .from("regimentos")
    .update({ rascunho_respostas: limpar(r.secoes, respostas), status: "enviado" })
    .eq("id", r.id);
  return { ok: true };
}

export async function enviarRespostasAction(token: string, respostas: Respostas, respondente: string): Promise<Resultado> {
  const r = await carregar(token);
  if (!r) return { ok: false, error: "Link inválido." };
  if (!r.aceitando || r.status === "respondido") return { ok: false, error: "Este formulário não está mais aceitando respostas." };
  const limpas = limpar(r.secoes, respostas);
  const faltam = r.secoes.flatMap((s) => s.perguntas).filter((p) => p.obrigatoria && !(Array.isArray(limpas[p.id]) ? (limpas[p.id] as string[]).length : limpas[p.id]));
  if (faltam.length) return { ok: false, error: `Responda as perguntas obrigatórias: ${faltam.map((p) => p.texto).slice(0, 3).join("; ")}` };
  const { error } = await db()
    .from("regimentos")
    .update({ respostas: limpas, rascunho_respostas: limpas, status: "respondido", respondido_em: new Date().toISOString(), respondente: respondente.trim().slice(0, 200) || null })
    .eq("id", r.id);
  if (error) return { ok: false, error: "Não foi possível enviar agora. Tente de novo em instantes." };

  // avisa o escritório (sininho + celular): admins e quem criou o regimento
  const { data: cliente } = r.client_id ? await db().from("clients").select("name").eq("id", r.client_id).maybeSingle() : { data: null };
  const destino = [...new Set([...(await idsDosAdmins()), ...(r.criado_por ? [r.criado_por] : [])])];
  await criarAvisos(
    destino.map((profile_id) => ({
      profile_id,
      tipo: "regimento_respondido",
      titulo: `Regimento respondido: ${cliente?.name ?? r.titulo}`,
      corpo: `${respondidas(r.secoes, limpas)} de ${totalPerguntas(r.secoes)} perguntas respondidas${respondente.trim() ? ` por ${respondente.trim()}` : ""}.`,
      url: `/admin/regimentos/${r.id}?aba=respostas`,
    }))
  ).catch(() => undefined);
  return { ok: true };
}
