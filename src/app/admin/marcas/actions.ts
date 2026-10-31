"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarNoInpi, type ResultadoBusca } from "@/lib/marcas/inpi";
import { sincronizarProcesso } from "@/lib/marcas/sincronizar";
import { enviarMarca, listMarcasZap, listModelos, modeloPara, montarMensagem, statusDaMensagem } from "@/lib/marcas/zap";

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

// ───────────── Cadastrar processos (busca no INPI) ─────────────

export type ResultadoCadastro = ResultadoBusca & { jaRegistrado: boolean };

export async function buscarCadastroAction(tipo: "processo" | "nome" | "titular" | "procurador", termo: string): Promise<{ ok: true; resultados: ResultadoCadastro[]; total: number } | { ok: false; error: string }> {
  await exigirPermissao("marcas");
  const t = termo.trim();
  if (t.length < 2) return { ok: false, error: "Digite um termo de busca." };
  try {
    let resultados: ResultadoBusca[] = [];
    let total = 0;
    if (tipo === "procurador") {
      // o pePI não busca marca por procurador: procura nas marcas que o portal já conhece
      const { data } = await db().from("marcas").select("processo, nome, situacao, titular, classe, deposito").ilike("procurador", `%${t.replace(/[%_]/g, " ")}%`).limit(500);
      resultados = (data ?? []).map((m) => ({ processo: m.processo, codPedido: "", marca: m.nome ?? "", situacao: m.situacao ?? "", titular: m.titular ?? "", classes: m.classe ?? "", deposito: m.deposito }));
      total = resultados.length;
    } else {
      ({ resultados, total } = await buscarNoInpi(tipo, t));
    }
    const { data: ja } = await db().from("marcas").select("processo").eq("acompanhando", true).in("processo", resultados.map((r) => r.processo).slice(0, 500));
    const set = new Set((ja ?? []).map((x) => x.processo));
    return { ok: true, total, resultados: resultados.map((r) => ({ ...r, jaRegistrado: set.has(r.processo) })) };
  } catch (e) {
    return { ok: false, error: `Não foi possível consultar o INPI agora (${(e as Error).message}). Tente de novo em instantes.` };
  }
}

/** Acompanhar um ou vários processos: lê a ficha no INPI e entra na carteira. */
export async function acompanharAction(processos: string[]): Promise<{ ok: true; feitos: number; erros: string[] } | { ok: false; error: string }> {
  const { profile } = await exigirPermissao("marcas");
  const lista = [...new Set(processos.map((p) => p.replace(/\D/g, "")).filter((p) => p.length === 9))].slice(0, 40);
  if (!lista.length) return { ok: false, error: "Nenhum processo válido (são 9 dígitos)." };
  const erros: string[] = [];
  let feitos = 0;
  for (const p of lista) {
    // já estava na carteira e foi desacompanhada: volta
    await db().from("marcas").update({ acompanhando: true }).eq("processo", p);
    const r = await sincronizarProcesso(p, { criado_por: profile.id, comLogo: true }).catch((e) => ({ ok: false as const, error: (e as Error).message }));
    if (r.ok) feitos++;
    else erros.push(r.error);
  }
  recarregar();
  return { ok: true, feitos, erros };
}

// ───────────── aba WhatsApp ─────────────

export async function salvarModeloAction(m: { id?: string; status: string; texto: string; ativo: boolean }): Promise<Resultado> {
  await exigirPermissao("marcas");
  const status = m.status.trim();
  const texto = m.texto.trim();
  if (!status || texto.length < 5) return { ok: false, error: "Informe o status e o texto do modelo." };
  const { error } = m.id ? await db().from("marca_modelos").update({ status, texto, ativo: m.ativo, updated_at: new Date().toISOString() }).eq("id", m.id) : await db().from("marca_modelos").insert({ status, texto, ativo: m.ativo, ordem: 50 });
  if (error) return { ok: false, error: error.code === "23505" ? "Já existe um modelo para esse status." : "Não foi possível salvar o modelo." };
  recarregar();
  return { ok: true };
}

export async function excluirModeloAction(id: string): Promise<Resultado> {
  await exigirPermissao("marcas");
  const { error } = await db().from("marca_modelos").delete().eq("id", id).neq("status", "Padrão");
  if (error) return { ok: false, error: "Não foi possível excluir o modelo." };
  recarregar();
  return { ok: true };
}

/** Edição direto na lista da aba WhatsApp: status da mensagem, nome e número do contato. */
export async function editarLinhaZapAction(processo: string, campo: "status_mensagem" | "contato_nome" | "contato_numero", valor: string): Promise<Resultado> {
  await exigirPermissao("marcas");
  let v: string | null = valor.trim() || null;
  if (campo === "contato_numero" && v) {
    v = v.replace(/\D/g, "");
    if (v.length < 10) return { ok: false, error: "Número inválido (coloque o DDD)." };
  }
  const { error } = await db().from("marcas").update({ [campo]: v }).eq("processo", processo);
  if (error) return { ok: false, error: "Não foi possível salvar." };
  recarregar();
  return { ok: true };
}

export async function salvarEnvioConfigAction(modo: "manual" | "automatico", dia: number): Promise<Resultado> {
  await exigirPermissao("marcas");
  if (!["manual", "automatico"].includes(modo) || dia < 1 || dia > 28) return { ok: false, error: "Escolha o modo e um dia entre 1 e 28." };
  const { error } = await db().from("marca_config").update({ envio_modo: modo, envio_dia: Math.round(dia), updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { ok: false, error: "Não foi possível salvar." };
  recarregar();
  return { ok: true };
}

/** "Enviar no Zap": uma, as selecionadas ou todas. textos = mensagem já editada por processo (opcional). */
export async function enviarZapAction(processos: string[], textos: Record<string, string> = {}): Promise<{ ok: true; enviados: number; erros: string[] } | { ok: false; error: string }> {
  const { profile } = await exigirPermissao("marcas");
  const [marcas, modelos] = await Promise.all([listMarcasZap(), listModelos()]);
  const alvo = marcas.filter((m) => processos.includes(m.processo));
  if (!alvo.length) return { ok: false, error: "Nenhuma marca selecionada." };
  let enviados = 0;
  const erros: string[] = [];
  for (const m of alvo.slice(0, 300)) {
    const modelo = modeloPara(statusDaMensagem(m), modelos);
    const texto = textos[m.processo]?.trim() || (modelo ? montarMensagem(m, modelo.texto) : "");
    if (!texto) {
      erros.push(`${m.processo}: sem modelo para "${statusDaMensagem(m)}".`);
      continue;
    }
    const r = await enviarMarca(m, texto, profile.id);
    if (r.ok) enviados++;
    else erros.push(r.error);
  }
  recarregar();
  return { ok: true, enviados, erros };
}

// ───────────── Colidências ─────────────
const STATUS_COLID = ["pendente", "revisada", "acao", "monitorando"] as const;

/** Muda o status de colidências (revisada, ações necessárias, monitorando ou de volta a pendente). */
export async function statusColidenciaAction(ids: string[], status: (typeof STATUS_COLID)[number]): Promise<Resultado> {
  const { profile } = await exigirPermissao("marcas");
  const lista = ids.filter((i) => /^[0-9a-f-]{36}$/i.test(i)).slice(0, 500);
  if (!lista.length || !STATUS_COLID.includes(status)) return { ok: false, error: "Nada selecionado." };
  const { error } = await db()
    .from("marca_colidencias")
    .update({ status, revisado_por: status === "pendente" ? null : profile.id, revisado_em: status === "pendente" ? null : new Date().toISOString() })
    .in("id", lista);
  if (error) return { ok: false, error: "Não foi possível atualizar." };
  recarregar();
  return { ok: true };
}

/** Configuração de colidência em lote: escopo e sensibilidade de várias marcas num fluxo só. */
export async function configColidenciaLoteAction(processos: string[], escopo: number, sensibilidade: number): Promise<Resultado> {
  await exigirPermissao("marcas");
  if (![1, 2, 3].includes(escopo) || ![1, 2, 3].includes(sensibilidade) || !processos.length) return { ok: false, error: "Escolha as marcas, o escopo e a sensibilidade." };
  const { error } = await db().from("marcas").update({ colid_auto: false, colid_escopo: escopo, colid_sensibilidade: sensibilidade }).in("processo", processos.slice(0, 1000));
  if (error) return { ok: false, error: "Não foi possível salvar." };
  recarregar();
  return { ok: true };
}
