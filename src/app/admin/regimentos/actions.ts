"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClient } from "@/lib/data/clients";
import { editarQuestionario, gerarQuestionario } from "@/lib/regimentos/ia";
import { normalizarSecoes, type Secao } from "@/lib/regimentos/tipos";

// Regimento Interno (31/10/2026): criar com IA, editar (à mão ou com IA),
// aceitar respostas e excluir. Lê pela sessão (RLS confere o acesso ao
// cliente) e grava com a chave de serviço (a tabela só tem leitura para a equipe).

type Resultado = { ok: true } | { ok: false; error: string };
// tabela da 0063 ainda fora dos tipos gerados
const admin = () => createAdminClient() as unknown as SupabaseClient;
const sessao = async () => (await createClient()) as unknown as SupabaseClient;
const recarregar = (id?: string, clientId?: string | null) => {
  revalidatePath("/admin/regimentos");
  if (id) revalidatePath(`/admin/regimentos/${id}`);
  if (clientId) revalidatePath(`/admin/clients/${clientId}`);
};

/** O regimento, se a pessoa pode ver (RLS: tela Onboarding + acesso ao cliente). */
async function meu(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await (await sessao()).from("regimentos").select("id, client_id, titulo, descricao, secoes, clients(name)").eq("id", id).maybeSingle();
  return data as { id: string; client_id: string | null; titulo: string; descricao: string | null; secoes: Secao[]; clients: { name: string } | null } | null;
}

export async function criarRegimentoAction(e: { clientId: string; nome: string; segmento: string; dados: Record<string, string> }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { profile } = await exigirPermissao("onboarding", "gerar_ia");
  const cliente = await getClient(e.clientId);
  if (!cliente) return { ok: false, error: "Escolha o cliente." };
  const nome = e.nome.trim() || cliente.name;
  if (!e.segmento.trim()) return { ok: false, error: "Informe o segmento da empresa." };
  const g = await gerarQuestionario({ nome, segmento: e.segmento.trim(), dados: e.dados });
  if (!g.ok) return g;
  const { data, error } = await admin()
    .from("regimentos")
    .insert({ client_id: cliente.id, titulo: g.titulo, descricao: g.descricao, segmento: e.segmento.trim(), dados: { nome, ...e.dados }, secoes: g.secoes, criado_por: profile.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: `Não foi possível salvar o regimento${error?.message.includes("regimentos") ? " (a tabela existe? rode a migration 0063)" : ""}.` };
  recarregar(undefined, cliente.id);
  return { ok: true, id: data.id as string };
}

export async function salvarQuestionarioAction(id: string, q: { titulo: string; descricao: string | null; secoes: Secao[] }): Promise<Resultado> {
  await exigirPermissao("onboarding");
  const r = await meu(id);
  if (!r) return { ok: false, error: "Regimento não encontrado." };
  const secoes = normalizarSecoes(q.secoes);
  const { error } = await admin()
    .from("regimentos")
    .update({ titulo: q.titulo.trim() || r.titulo, descricao: q.descricao?.trim() || null, secoes, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Não foi possível salvar." };
  recarregar(id, r.client_id);
  return { ok: true };
}

export async function editarComIAAction(id: string, pedido: string): Promise<{ ok: true; descricao: string; secoes: Secao[] } | { ok: false; error: string }> {
  await exigirPermissao("onboarding", "gerar_ia");
  const r = await meu(id);
  if (!r) return { ok: false, error: "Regimento não encontrado." };
  if (pedido.trim().length < 3) return { ok: false, error: "Escreva o que a IA deve mudar." };
  const e = await editarQuestionario({ descricao: r.descricao, secoes: r.secoes }, pedido.trim(), r.clients?.name ?? r.titulo);
  if (!e.ok) return e;
  // não grava ainda: a tela mostra e a pessoa salva (ou desfaz)
  return e;
}

export async function aceitandoAction(id: string, aceitando: boolean): Promise<Resultado> {
  await exigirPermissao("onboarding");
  const r = await meu(id);
  if (!r) return { ok: false, error: "Regimento não encontrado." };
  await admin().from("regimentos").update({ aceitando }).eq("id", id);
  recarregar(id, r.client_id);
  return { ok: true };
}

/** "Copiar link": o rascunho passa a "enviado" (a pessoa manda o link no Zap/e-mail por conta própria). */
export async function marcarEnviadoAction(id: string): Promise<Resultado> {
  await exigirPermissao("onboarding");
  const r = await meu(id);
  if (!r) return { ok: false, error: "Regimento não encontrado." };
  await admin().from("regimentos").update({ status: "enviado" }).eq("id", id).eq("status", "rascunho");
  recarregar(id, r.client_id);
  return { ok: true };
}

export async function reabrirRespostasAction(id: string): Promise<Resultado> {
  await exigirPermissao("onboarding");
  const r = await meu(id);
  if (!r) return { ok: false, error: "Regimento não encontrado." };
  // a empresa pode corrigir: as respostas enviadas voltam como rascunho dela
  const { data } = await admin().from("regimentos").select("respostas").eq("id", id).single();
  await admin()
    .from("regimentos")
    .update({ status: "enviado", aceitando: true, rascunho_respostas: data?.respostas ?? {} })
    .eq("id", id);
  recarregar(id, r.client_id);
  return { ok: true };
}

export async function excluirRegimentoAction(id: string): Promise<Resultado> {
  await exigirPermissao("onboarding");
  const r = await meu(id);
  if (!r) return { ok: false, error: "Regimento não encontrado." };
  const { error } = await admin().from("regimentos").delete().eq("id", id);
  if (error) return { ok: false, error: "Não foi possível excluir." };
  recarregar(undefined, r.client_id);
  return { ok: true };
}
