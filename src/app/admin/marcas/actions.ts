"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";

// Ações do módulo Marcas (30/10/2026). Confere a permissão "marcas" e grava
// com a chave de serviço (as tabelas da 0061 só têm leitura para a equipe).

type Resultado = { ok: true } | { ok: false; error: string };
// tabelas da 0061 ainda fora dos tipos gerados
const db = () => createAdminClient() as unknown as SupabaseClient;
const recarregar = () => revalidatePath("/admin/marcas", "layout");

export async function desacompanharAction(processo: string): Promise<Resultado> {
  await exigirPermissao("marcas");
  const { error } = await db().from("marcas").update({ acompanhando: false }).eq("processo", processo);
  if (error) return { ok: false, error: "Não foi possível desacompanhar." };
  recarregar();
  return { ok: true };
}

export async function voltarAcompanharAction(processo: string): Promise<Resultado> {
  await exigirPermissao("marcas");
  const { error } = await db().from("marcas").update({ acompanhando: true }).eq("processo", processo);
  if (error) return { ok: false, error: "Não foi possível voltar a acompanhar." };
  recarregar();
  return { ok: true };
}

export type ConfigAcompanhamento = {
  avisar_cliente: boolean;
  colidencia: boolean;
  colid_auto: boolean;
  colid_escopo: number;
  colid_sensibilidade: number;
  colid_termos: Record<string, number>;
  colid_extras: string[];
  colid_ignorar: string[];
  apelido: string | null;
  client_id: string | null;
  contato_nome: string | null;
  contato_numero: string | null;
  observacao: string | null;
};

const lista8 = (xs: unknown) =>
  (Array.isArray(xs) ? xs : [])
    .map((x) => String(x).trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 8);

/** Tela "Configurar acompanhamento" de um processo. */
export async function salvarConfigAction(processo: string, c: ConfigAcompanhamento): Promise<Resultado> {
  await exigirPermissao("marcas");
  const termos: Record<string, number> = {};
  for (const [t, v] of Object.entries(c.colid_termos ?? {})) if ([1, 2, 3].includes(Number(v))) termos[t.toUpperCase()] = Number(v);
  const numero = (c.contato_numero ?? "").replace(/\D/g, "");
  const { error } = await db()
    .from("marcas")
    .update({
      avisar_cliente: !!c.avisar_cliente,
      colidencia: !!c.colidencia,
      colid_auto: !!c.colid_auto,
      colid_escopo: [1, 2, 3].includes(c.colid_escopo) ? c.colid_escopo : 1,
      colid_sensibilidade: [1, 2, 3].includes(c.colid_sensibilidade) ? c.colid_sensibilidade : 2,
      colid_termos: termos,
      colid_extras: lista8(c.colid_extras),
      colid_ignorar: lista8(c.colid_ignorar),
      apelido: c.apelido?.trim() || null,
      client_id: c.client_id && /^[0-9a-f-]{36}$/i.test(c.client_id) ? c.client_id : null,
      contato_nome: c.contato_nome?.trim() || null,
      contato_numero: numero.length >= 10 ? numero : null,
      observacao: c.observacao?.trim() || null,
    })
    .eq("processo", processo);
  if (error) return { ok: false, error: "Não foi possível salvar a configuração." };
  recarregar();
  return { ok: true };
}
