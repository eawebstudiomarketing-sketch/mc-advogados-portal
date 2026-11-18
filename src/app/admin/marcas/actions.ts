"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exigirPermissao } from "@/lib/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarProcuradorNaCarteira } from "@/lib/marcas/procurador";
import { buscarNoInpi, buscarProcuradorNaBase, fichaNoInpi, type FichaINPI, type FonteBusca, type ResultadoBusca } from "@/lib/marcas/inpi";
import { consultarBase, situacaoDoDespacho } from "@/lib/marcas/base";
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
  responsavel_id?: string | null;
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
  const dados: Record<string, unknown> = {
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
      responsavel_id: c.responsavel_id && /^[0-9a-f-]{36}$/i.test(c.responsavel_id) ? c.responsavel_id : null,
  };
  let { error } = await db().from("marcas").update(dados).eq("processo", processo);
  // migration 0078 ainda não rodada: salva o resto sem o responsável
  if (error && /responsavel_id/.test(error.message)) {
    delete dados.responsavel_id;
    ({ error } = await db().from("marcas").update(dados).eq("processo", processo));
  }
  if (error) return { ok: false, error: "Não foi possível salvar a configuração." };
  recarregar();
  return { ok: true };
}

// ───────────── Cadastrar processos (busca no INPI) ─────────────

export type ResultadoCadastro = ResultadoBusca & { jaRegistrado: boolean };

export async function buscarCadastroAction(tipo: "processo" | "nome" | "titular" | "procurador", termo: string): Promise<{ ok: true; resultados: ResultadoCadastro[]; total: number; fonte: FonteBusca; avisoInpi?: string | null } | { ok: false; error: string }> {
  await exigirPermissao("marcas");
  const t = termo.trim();
  if (t.length < 2) return { ok: false, error: "Digite um termo de busca." };
  try {
    let resultados: ResultadoBusca[] = [];
    let total = 0;
    let fonte: FonteBusca = { fonte: "inpi" };
    let avisoInpi: string | null = null;
    if (tipo === "procurador") {
      // o pePI não busca marca por procurador: base própria (todas as revistas desde 2017) + as que o portal já conhece
      const daCarteira = await buscarProcuradorNaCarteira(t);
      const base = await buscarProcuradorNaBase(t).catch(() => null);
      const vistos = new Set(daCarteira.map((m) => m.processo));
      resultados = [...daCarteira, ...(base?.resultados ?? []).filter((r) => !vistos.has(r.processo))];
      total = Math.max(resultados.length, (base?.total ?? 0) + daCarteira.length);
      if (base) fonte = base;
    } else {
      const r = await buscarNoInpi(tipo, t);
      ({ resultados, total } = r);
      avisoInpi = r.avisoInpi ?? null;
      fonte = r.fonte === "base" ? { fonte: "base", revista: r.revista, data: r.data, motivo: r.motivo } : { fonte: "inpi" };
      // 17/11/2026: processo ainda não publicado (não está no INPI nem nas revistas) mas já cadastrado
      // na carteira como "Aguardando publicação": mostra ele em vez de "Nenhum processo encontrado"
      if (tipo === "processo" && !resultados.length) {
        const { data: m } = await db().from("marcas").select("processo, nome, situacao, titular, classe, deposito, apresentacao").eq("processo", t.replace(/\D/g, "")).maybeSingle();
        if (m) {
          resultados = [{ processo: m.processo, codPedido: "", marca: m.nome ?? "", situacao: m.situacao ?? "", titular: m.titular ?? "", classes: m.classe ?? "", deposito: m.deposito ?? null, apresentacao: m.apresentacao ?? null }];
          total = 1;
        }
      }
    }
    const { data: ja } = await db().from("marcas").select("processo").eq("acompanhando", true).in("processo", resultados.map((r) => r.processo).slice(0, 500));
    const set = new Set((ja ?? []).map((x) => x.processo));
    return { ok: true, total, fonte, avisoInpi, resultados: resultados.map((r) => ({ ...r, jaRegistrado: set.has(r.processo) })) };
  } catch (e) {
    return { ok: false, error: `Não foi possível consultar o INPI agora (${(e as Error).message}). Tente de novo em instantes.` };
  }
}

export type DadosManuais = { nome?: string; classe?: string; titular?: string; client_id?: string | null; observacao?: string };

/** Entra na carteira só com o que se sabe: da revista (INPI fora do ar) ou digitado (ainda não publicado). A conferência diária completa a ficha. */
async function entrarSemFicha(p: string, profileId: string, manual: DadosManuais | undefined, motivoFora: string | null, avisoInpi: string | null = null): Promise<{ ok: boolean; aviso?: string; erro?: string }> {
  const b = await consultarBase("processo", p).catch(() => null);
  const l = b?.resultados[0];
  const cls = (manual?.classe ?? "").replace(/\D/g, "");
  const linha: Record<string, unknown> = {
    processo: p,
    tipo: "marca",
    acompanhando: true,
    origem: "portal",
    criado_por: profileId,
    nome: l?.marca ?? (manual?.nome?.trim() || null),
    titular: l?.titular ?? (manual?.titular?.trim() || null),
    classe: l?.classes ? `NCL ${l.classes.split(",")[0]}` : cls ? `NCL ${Number(cls)}` : null,
    apresentacao: l?.apresentacao ?? null,
    natureza: l?.natureza ?? null,
    especificacao: l?.especificacao ?? null,
    procurador: l?.procurador ?? null,
    titular_uf: l?.uf ?? null,
    deposito: l?.deposito ?? null,
    concessao: l?.concessao ?? null,
    vigencia: l?.vigencia ?? null,
    situacao: l ? situacaoDoDespacho(l.ultimo_despacho, l.concessao) : "Aguardando publicação",
    ultimo_despacho: l?.ultimo_despacho ?? null,
    ultimo_despacho_data: l?.ultima_data ?? null,
    ultima_rpi: l?.ultima_rpi ?? null,
    ...(manual?.client_id && /^[0-9a-f-]{36}$/i.test(manual.client_id) ? { client_id: manual.client_id } : {}),
    ...(manual?.observacao?.trim() ? { observacao: manual.observacao.trim() } : {}),
  };
  // não apaga o que já existia (marca que estava desacompanhada)
  const { data: ja } = await db().from("marcas").select("id, nome").eq("processo", p).maybeSingle();
  const { error } = ja
    ? // 18/11/2026: recadastrar não troca quem cadastrou nem a origem (o teste sobrescreveu o criado_por do 945791070)
      await db().from("marcas").update(Object.fromEntries(Object.entries(linha).filter(([k, v]) => v !== null && !["criado_por", "origem", "tipo"].includes(k) && !(k === "nome" && ja.nome)))).eq("processo", p)
    : await db().from("marcas").insert(linha);
  if (error) return { ok: false, erro: `${p}: ${error.message}` };
  if (l) return { ok: true, aviso: `${p}: o INPI está fora do ar agora (${motivoFora ?? "sem resposta"}). Entrou com os dados da revista ${l.ultima_rpi ?? ""}; a ficha completa vem na conferência.` };
  // 18/11/2026: o mesmo AVISO que o INPI mostra para pedido ainda não publicado (confirma que o número existe)
  if (avisoInpi) return { ok: true, aviso: `INPI: ${avisoInpi} · Entrou na carteira como "Aguardando publicação"${linha.nome ? ` (${linha.nome})` : ""}.` };
  return { ok: true, aviso: `${p}: o INPI não reconheceu este número (confira se está certo). Entrou na carteira como "Aguardando publicação"${linha.nome ? ` (${linha.nome})` : ""}; quando sair na revista, a ficha completa entra sozinha e você recebe aviso.` };
}

/** Acompanhar um ou vários processos: lê a ficha no INPI e entra na carteira. */
export async function acompanharAction(processos: string[], manual?: DadosManuais): Promise<{ ok: true; feitos: number; erros: string[]; avisos: string[] } | { ok: false; error: string }> {
  const { profile } = await exigirPermissao("marcas");
  const lista = [...new Set(processos.map((p) => p.replace(/\D/g, "")).filter((p) => p.length === 9))].slice(0, 10);
  if (!lista.length) return { ok: false, error: "Nenhum processo válido (são 9 dígitos)." };
  const erros: string[] = [];
  const avisos: string[] = [];
  let feitos = 0;
  for (const [i, p] of lista.entries()) {
    // o pePI bloqueia consultas em sequência (31/10/2026): 8 s entre um processo e outro
    if (i > 0) await new Promise((r) => setTimeout(r, 8_000));
    // já estava na carteira e foi desacompanhada: volta
    await db().from("marcas").update({ acompanhando: true }).eq("processo", p);
    const r = await sincronizarProcesso(p, { criado_por: profile.id, comLogo: true, client_id: manual?.client_id ?? null }).catch((e) => ({ ok: false as const, error: (e as Error).message }));
    if (r.ok) feitos++;
    else {
      // 09/11/2026: recém-protocolada (o INPI ainda não publicou) ou INPI fora do ar.
      // Entra na carteira com os dados da revista (base própria) ou os digitados;
      // a conferência diária e a leitura da revista completam a ficha.
      const fora = /Ponte do INPI|fora do ar|timeout|aborted|fetch failed|respondeu 5/i.test(r.error);
      if (!fora && !/não encontrado no INPI/.test(r.error)) {
        erros.push(r.error);
        continue;
      }
      const e = await entrarSemFicha(p, profile.id, manual, fora ? r.error : null, "avisoInpi" in r ? (r.avisoInpi ?? null) : null);
      if (e.ok) {
        feitos++;
        if (e.aviso) avisos.push(e.aviso);
      } else if (e.erro) erros.push(e.erro);
    }
  }
  recarregar();
  return { ok: true, feitos, erros, avisos };
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

/** Ficha → "Petições do processo": lidas na hora no pePI (como o Marca Acompanhada faz ao abrir a ficha). */
export async function peticoesAction(processo: string): Promise<{ ok: true; peticoes: FichaINPI["peticoes"] } | { ok: false; error: string }> {
  await exigirPermissao("marcas");
  try {
    const f = await fichaNoInpi(processo);
    if (!f) return { ok: false, error: "Processo não encontrado no INPI." };
    return { ok: true, peticoes: f.peticoes };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
