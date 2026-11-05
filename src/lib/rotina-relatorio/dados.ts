import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPessoas } from "@/lib/data/escritorio";
import {
  faltaParaEnviar,
  type DemandaVencida,
  type Modelo,
  type Pergunta,
  type PessoaEquipe,
  type RelatorioDoDia,
  type Snapshot,
  type Valor,
} from "./tipos";

// Rotinas v2: acesso ao banco do relatório do dia. Tudo pelo servidor (service
// role); quem chama já checou quem pode ver o quê.

const db = () => createAdminClient() as unknown as SupabaseClient;
export const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

// ───────── modelos de pergunta ─────────

export async function carregarModelos(): Promise<Modelo[]> {
  const [{ data: modelos }, { data: perguntas }] = await Promise.all([
    db().from("rotina_modelos").select("id, nome, ativo, aprovador_id").eq("ativo", true).order("nome"),
    db().from("rotina_perguntas").select("*").order("ordem").order("created_at"),
  ]);
  return (modelos ?? []).map((m) => ({ ...m, perguntas: ((perguntas ?? []) as Pergunta[]).filter((p) => p.modelo_id === m.id) })) as Modelo[];
}

export async function modeloDaPessoa(responsavelId: string): Promise<Modelo | null> {
  const { data } = await db().from("responsaveis").select("rotina_modelo_id").eq("id", responsavelId).maybeSingle();
  if (!data?.rotina_modelo_id) return null;
  return (await carregarModelos()).find((m) => m.id === data.rotina_modelo_id) ?? null;
}

/** Quem usa cada modelo: responsavel_id → modelo_id. */
export async function modelosAtribuidos(): Promise<Map<string, string>> {
  const { data } = await db().from("responsaveis").select("id, rotina_modelo_id").not("rotina_modelo_id", "is", null);
  return new Map((data ?? []).map((r) => [r.id as string, r.rotina_modelo_id as string]));
}

export type PerguntaEditavel = Partial<Pick<Pergunta, "id" | "secao" | "tipo" | "opcoes" | "obrigatoria" | "ativa">> & { texto: string };

export async function salvarModelo(m: { id?: string | null; nome: string; aprovadorId?: string | null; perguntas: PerguntaEditavel[] }): Promise<string> {
  const nome = m.nome.trim();
  if (!nome) throw new Error("Dê um nome ao modelo.");
  let id = m.id ?? null;
  if (id) {
    const { error } = await db().from("rotina_modelos").update({ nome, aprovador_id: m.aprovadorId ?? null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await db().from("rotina_modelos").insert({ nome, aprovador_id: m.aprovadorId ?? null }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Não foi possível criar o modelo.");
    id = data.id as string;
  }
  // perguntas: atualiza as que já existem, cria as novas e tira as que sumiram da tela
  const { data: atuais } = await db().from("rotina_perguntas").select("id").eq("modelo_id", id);
  const existentes = new Set((atuais ?? []).map((a) => a.id as string));
  const manter = new Set<string>();
  let ordem = 0;
  for (const p of m.perguntas) {
    const texto = p.texto.trim();
    if (!texto) continue;
    const linha = {
      modelo_id: id,
      secao: p.secao ?? "pessoal",
      ordem: ordem++,
      texto,
      tipo: p.tipo ?? "texto_longo",
      opcoes: (p.opcoes ?? []).map((o) => o.trim()).filter(Boolean),
      obrigatoria: p.obrigatoria ?? true,
      ativa: p.ativa ?? true,
    };
    if (p.id && existentes.has(p.id)) {
      manter.add(p.id);
      await db().from("rotina_perguntas").update(linha).eq("id", p.id);
    } else {
      await db().from("rotina_perguntas").insert(linha);
    }
  }
  const sobrando = [...existentes].filter((x) => !manter.has(x));
  if (sobrando.length) await db().from("rotina_perguntas").delete().in("id", sobrando);
  return id!;
}

export async function excluirModelo(id: string) {
  await db().from("rotina_modelos").update({ ativo: false }).eq("id", id);
  await db().from("responsaveis").update({ rotina_modelo_id: null }).eq("rotina_modelo_id", id);
}

export async function atribuirModelo(responsavelId: string, modeloId: string | null) {
  const { error } = await db().from("responsaveis").update({ rotina_modelo_id: modeloId }).eq("id", responsavelId);
  if (error) throw new Error(error.message);
}

// ───────── o que entra no relatório ─────────

/** Demandas abertas da pessoa que venceram até o dia (as que ela precisa justificar). */
export async function demandasVencidas(responsavelId: string, dia: string): Promise<DemandaVencida[]> {
  const { data } = await db()
    .from("activities")
    .select("id, title, deadline, clients(name)")
    .eq("responsavel_id", responsavelId)
    .in("status", ["aberta", "em_andamento"])
    .is("archived_at", null)
    .not("deadline", "is", null)
    .lte("deadline", dia)
    .order("deadline");
  return (data ?? []).map((a) => ({
    id: a.id as string,
    titulo: a.title as string,
    cliente: (a.clients as unknown as { name: string } | null)?.name ?? null,
    prazo: a.deadline as string,
    diasAtraso: Math.max(0, Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${a.deadline}T12:00:00Z`)) / 86_400_000)),
  }));
}

/**
 * A equipe sobre quem a pessoa responde nas perguntas "por pessoa" (a avaliação de cada integrante).
 * Só o admin máximo avalia a equipe: para os demais a lista é vazia e a seção nem aparece.
 */
export async function equipeDe(responsavelId: string): Promise<PessoaEquipe[]> {
  const { data: resp } = await db().from("responsaveis").select("profile_id").eq("id", responsavelId).maybeSingle();
  if (!resp?.profile_id) return [];
  const { data: perfil } = await db().from("profiles").select("super_admin").eq("id", resp.profile_id).maybeSingle();
  if (!perfil?.super_admin) return [];
  return (await listPessoas())
    .filter((p) => p.profileId && p.id !== responsavelId)
    .map((p) => ({ id: p.id, nome: p.nome }));
}

// ───────── o relatório ─────────

type Linha = {
  id: string;
  responsavel_id: string;
  dia: string;
  modelo_id: string | null;
  status: "rascunho" | "enviado";
  respostas: Record<string, Valor>;
  justificativas: Record<string, string>;
  perguntas_snap: Snapshot | null;
  enviado_em: string | null;
  nota: number | null;
  comentario: string | null;
  aprovado_em: string | null;
  editado_em: string | null;
};
const paraRelatorio = (l: Linha): RelatorioDoDia => ({
  id: l.id,
  responsavel_id: l.responsavel_id,
  dia: l.dia,
  modelo_id: l.modelo_id,
  status: l.status,
  respostas: l.respostas ?? {},
  justificativas: l.justificativas ?? {},
  snapshot: l.perguntas_snap,
  enviado_em: l.enviado_em,
  nota: l.nota ?? null,
  comentario: l.comentario ?? null,
  aprovado_em: l.aprovado_em ?? null,
  editado_em: l.editado_em ?? null,
});

export async function lerRelatorio(responsavelId: string, dia: string): Promise<RelatorioDoDia | null> {
  const { data } = await db().from("rotina_relatorios").select("*").eq("responsavel_id", responsavelId).eq("dia", dia).maybeSingle();
  return data ? paraRelatorio(data as Linha) : null;
}

export async function relatoriosDoDia(dia: string): Promise<RelatorioDoDia[]> {
  const { data } = await db().from("rotina_relatorios").select("*").eq("dia", dia);
  return ((data ?? []) as Linha[]).map(paraRelatorio);
}

/**
 * Prazo do relatório do dia (04/11/2026, regra do João): a equipe preenche até
 * as 17:00 (05/11/2026, antes 18:00); o admin máximo (Maurício), que aprova os da equipe, até as 23:59.
 * `hora` = hora cheia em que fecha (24 = meia-noite).
 */
export async function prazoDoRelatorio(responsavelId: string): Promise<{ hora: number; texto: string }> {
  const { data } = await db().from("responsaveis").select("profiles!responsaveis_profile_id_fkey(role, super_admin)").eq("id", responsavelId).maybeSingle();
  const p = (data?.profiles ?? null) as unknown as { role: string; super_admin: boolean | null } | null;
  return p?.role === "admin" && p.super_admin ? { hora: 24, texto: "23:59" } : { hora: 17, texto: "17:00" };
}

const horaBahia = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", hour: "2-digit", hour12: false }).format(new Date())) % 24;

/** Só aceita o dia de hoje (Bahia), até o prazo da pessoa (17:00 a equipe, 23:59 o admin máximo). */
async function exigirHoje(dia: string, responsavelId: string) {
  const prazo = await prazoDoRelatorio(responsavelId);
  if (dia !== hojeBahia()) throw new Error(`O relatório só pode ser preenchido e enviado no próprio dia, até as ${prazo.texto}.`);
  if (horaBahia() >= prazo.hora) throw new Error(`O relatório de hoje fechou às ${prazo.texto}.`);
}

export async function salvarRascunho(responsavelId: string, dia: string, respostas: Record<string, Valor>, justificativas: Record<string, string>) {
  await exigirHoje(dia, responsavelId);
  const atual = await lerRelatorio(responsavelId, dia);
  if (atual?.status === "enviado") throw new Error("Este relatório já foi enviado.");
  const modelo = await modeloDaPessoa(responsavelId);
  const { error } = await db()
    .from("rotina_relatorios")
    .upsert(
      { responsavel_id: responsavelId, dia, modelo_id: modelo?.id ?? null, respostas, justificativas, status: "rascunho", updated_at: new Date().toISOString() },
      { onConflict: "responsavel_id,dia" }
    );
  if (error) throw new Error(error.message);
}

/** Valida e envia. Devolve a lista do que falta (vazia = enviado). */
export async function enviarRelatorio(responsavelId: string, dia: string, respostas: Record<string, Valor>, justificativas: Record<string, string>): Promise<string[]> {
  await exigirHoje(dia, responsavelId);
  const atual = await lerRelatorio(responsavelId, dia);
  if (atual?.status === "enviado") throw new Error("Este relatório já foi enviado.");
  const modelo = await modeloDaPessoa(responsavelId);
  if (!modelo) throw new Error("Você ainda não tem um modelo de relatório. Peça ao administrador.");
  const [equipe, demandas] = await Promise.all([equipeDe(responsavelId), demandasVencidas(responsavelId, dia)]);
  const ativas = modelo.perguntas.filter((p) => p.ativa);
  const usaEquipe = ativas.some((p) => p.secao === "equipe_pessoa");
  const faltas = faltaParaEnviar({ perguntas: ativas, equipe: usaEquipe ? equipe : [], respostas, demandas, justificativas });
  if (faltas.length) return faltas;
  const snapshot: Snapshot = {
    perguntas: ativas.map((p) => ({ id: p.id, secao: p.secao, texto: p.texto, tipo: p.tipo, opcoes: p.opcoes, obrigatoria: p.obrigatoria })),
    equipe: usaEquipe ? equipe : [],
    demandas,
  };
  const { error } = await db()
    .from("rotina_relatorios")
    .upsert(
      {
        responsavel_id: responsavelId,
        dia,
        modelo_id: modelo.id,
        respostas,
        justificativas,
        perguntas_snap: snapshot,
        status: "enviado",
        enviado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "responsavel_id,dia" }
    );
  if (error) throw new Error(error.message);
  return [];
}

// ───────── aprovação e edição (só o admin máximo) ─────────

/** Aprova um relatório enviado: nota de 0 a 10 e comentário opcional. */
export async function aprovarRelatorio(responsavelId: string, dia: string, nota: number, comentario: string | null, porProfileId: string) {
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) throw new Error("A nota vai de 0 a 10.");
  const atual = await lerRelatorio(responsavelId, dia);
  if (!atual || atual.status !== "enviado") throw new Error("Só dá para aprovar um relatório já enviado.");
  const { error } = await db()
    .from("rotina_relatorios")
    .update({ nota, comentario: comentario?.trim() || null, aprovado_em: new Date().toISOString(), aprovado_por: porProfileId, updated_at: new Date().toISOString() })
    .eq("responsavel_id", responsavelId)
    .eq("dia", dia);
  if (error) throw new Error(error.message);
}

/** Corrige as respostas de um relatório já enviado (só o admin máximo, se quiser). */
export async function editarRelatorioEnviado(responsavelId: string, dia: string, respostas: Record<string, Valor>, justificativas: Record<string, string>, porProfileId: string) {
  const atual = await lerRelatorio(responsavelId, dia);
  if (!atual || atual.status !== "enviado") throw new Error("O relatório ainda não foi enviado.");
  const { error } = await db()
    .from("rotina_relatorios")
    .update({ respostas, justificativas, editado_em: new Date().toISOString(), editado_por: porProfileId, updated_at: new Date().toISOString() })
    .eq("responsavel_id", responsavelId)
    .eq("dia", dia);
  if (error) throw new Error(error.message);
}

/** Notas de rotina (aprovadas pelo Maurício) de cada pessoa no período: média de 0 a 10 e quantos relatórios. */
export async function notasDeRotina(ini: string, fim: string): Promise<Map<string, { media: number; relatorios: number }>> {
  const { data } = await db().from("rotina_relatorios").select("responsavel_id, nota").not("nota", "is", null).gte("dia", ini).lt("dia", fim);
  const soma = new Map<string, { s: number; n: number }>();
  for (const r of data ?? []) {
    const x = soma.get(r.responsavel_id as string) ?? { s: 0, n: 0 };
    x.s += Number(r.nota);
    x.n++;
    soma.set(r.responsavel_id as string, x);
  }
  return new Map([...soma].map(([id, x]) => [id, { media: Math.round((x.s / x.n) * 10) / 10, relatorios: x.n }]));
}

/** Histórico de relatórios de uma pessoa (do mais novo para o mais antigo). */
export async function historicoDaPessoa(responsavelId: string, limite = 60): Promise<RelatorioDoDia[]> {
  const { data } = await db().from("rotina_relatorios").select("*").eq("responsavel_id", responsavelId).order("dia", { ascending: false }).limit(limite);
  return ((data ?? []) as Linha[]).map(paraRelatorio);
}
