"use server";

import { revalidatePath } from "next/cache";
import { requireRole, temPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { idsDoLote } from "@/lib/lote";
import { enfileirarParabens } from "@/lib/zap/aniversarios";
import type { ResultadoLote } from "@/components/ui/selecao-lista";

const CAMINHO = "/admin/clients/aniversarios";
const anoBahia = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric" }).format(new Date()));

/** Data de nascimento direto na lista (mesma assinatura da edição na linha). */
export async function salvarNascimentoAction(ids: string[], valor: string): Promise<ResultadoLote> {
  await requireRole(["admin", "advogado"]);
  if (!(await temPermissao("clientes", "editar_cliente"))) return { ok: false, error: "Você não tem permissão para editar clientes." };
  const lista = idsDoLote(ids);
  if (!lista) return { ok: false, error: "Cliente inválido." };
  const data = valor || null;
  if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > new Date().toISOString().slice(0, 10) || data < "1900-01-01")) return { ok: false, error: "Data de nascimento inválida." };
  const { data: feitos, error } = await (await createClient()).from("clients").update({ nascimento: data }).in("id", lista).select("id");
  if (error) return { ok: false, error: "Não foi possível salvar a data. Tente novamente." };
  revalidatePath(CAMINHO);
  return { ok: true, count: feitos?.length ?? 0 };
}

/** Botão "Enviar parabéns": a pessoa vê o texto, pode editar e confirma. */
export async function enviarParabensAction(clientId: string, texto: string): Promise<{ ok: true; rotulo: string } | { ok: false; error: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  if (!(await temPermissao("clientes"))) return { ok: false, error: "Você não tem permissão." };
  const msg = texto.trim();
  if (msg.length < 5 || msg.length > 1500) return { ok: false, error: "O texto precisa ter entre 5 e 1.500 caracteres." };
  const { data: c } = await (await createClient()).from("clients").select("id, name").eq("id", clientId).maybeSingle(); // o banco limita ao que a pessoa vê
  if (!c) return { ok: false, error: "Cliente não encontrado." };
  const r = await enfileirarParabens(c, msg, anoBahia(), profile.id);
  if (r.ok) revalidatePath(CAMINHO);
  return r;
}

/** Liga/desliga o parabéns automático e grava o texto-modelo (só admin). */
export async function salvarConfigAniversarioAction(ativo: boolean, mensagem: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await requireRole(["admin", "advogado"]);
  if (profile.role !== "admin") return { ok: false, error: "Só o administrador muda o parabéns automático." };
  const msg = mensagem.trim();
  if (msg.length < 5 || msg.length > 1500) return { ok: false, error: "O texto precisa ter entre 5 e 1.500 caracteres." };
  const { error } = await createAdminClient()
    .from("escritorio_config")
    .update({ aniversario_ativo: ativo, aniversario_mensagem: msg, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: "Não foi possível salvar (a atualização do banco 0058 ainda não foi aplicada?)." };
  revalidatePath(CAMINHO);
  return { ok: true };
}
