"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { exigirPermissao } from "@/lib/dal";

// Mensagens rápidas do WhatsApp (03/11/2026): textos prontos do escritório todo.
// Na conversa, digitar "/" abre a lista; escolher coloca o texto no campo, pronto
// para enviar ou ajustar. {nome} vira o primeiro nome do contato.

export type RespostaRapida = { id: string; atalho: string; texto: string };

// tabela da migration 0065 (fora do types.ts gerado)
const db = async () => (await createClient()) as unknown as SupabaseClient;
const ATALHO = /^[a-z0-9_-]{1,30}$/;

/** Atalho limpo: minúsculas, sem acento, espaço vira hífen ("Bom dia" → "bom-dia"). */
const limparAtalho = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\/+/, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 30);

export async function listarRespostasRapidasAction(): Promise<RespostaRapida[]> {
  await exigirPermissao("whatsapp");
  const { data } = await (await db()).from("wa_respostas_rapidas").select("id, atalho, texto").order("ordem").order("atalho");
  return (data ?? []) as RespostaRapida[];
}

export async function salvarRespostaRapidaAction(r: { id?: string; atalho: string; texto: string }): Promise<{ ok: boolean; erro?: string; resposta?: RespostaRapida }> {
  const { profile } = await exigirPermissao("whatsapp");
  const atalho = limparAtalho(r.atalho);
  const texto = r.texto.trim().slice(0, 4000);
  if (!ATALHO.test(atalho)) return { ok: false, erro: "Escreva o atalho (letras e números, ex.: bomdia)." };
  if (!texto) return { ok: false, erro: "Escreva o texto da mensagem." };
  const d = await db();
  const { data, error } = r.id
    ? await d.from("wa_respostas_rapidas").update({ atalho, texto, updated_at: new Date().toISOString() }).eq("id", r.id).select("id, atalho, texto").single()
    : await d.from("wa_respostas_rapidas").insert({ atalho, texto, criado_por: profile.id }).select("id, atalho, texto").single();
  if (error) return { ok: false, erro: error.code === "23505" ? `Já existe a mensagem /${atalho}.` : "Não foi possível salvar." };
  return { ok: true, resposta: data as RespostaRapida };
}

export async function excluirRespostaRapidaAction(id: string): Promise<{ ok: boolean; erro?: string }> {
  await exigirPermissao("whatsapp");
  const { error } = await (await db()).from("wa_respostas_rapidas").delete().eq("id", id);
  return error ? { ok: false, erro: "Não foi possível excluir." } : { ok: true };
}
