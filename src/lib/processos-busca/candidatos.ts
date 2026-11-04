import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { gravarDoRobo, type MovRobo } from "@/lib/andamentos/robos";
import { ligarPublicacoesAosProcessos } from "@/lib/publicacoes/monitor";
import { areaDe, tituloDe } from "@/lib/publicacoes/criar-processos";
import type { ProcessArea } from "@/lib/process-area";
import { datajudResumo, djenPorNumero, mascaraCnj, tribunalDoNumero, type AdvogadoDjen, type ParteDjen } from "./fontes";

// Processo novo passa por aprovação (30/10/2026). Fluxo:
//  1. abrirCandidato: alguém pesquisou o número (ou o DJEN achou um número que o portal não tem) →
//     guarda os dados públicos (DataJud + DJEN) e põe na fila do robô (status "lendo");
//  2. o robô da VPS (leitor_sob_demanda.py) lê o processo no tribunal e grava a leitura → "pronto";
//  3. aprovarCandidato: cria o processo; o histórico lido entra todo como histórico (sem aviso) e o
//     processo passa para a coleta de 3 em 3 horas. Se o robô ainda não terminou, ele mesmo manda os
//     andamentos ao portal quando terminar.

type Db = SupabaseClient;

export type ResumoCandidato = {
  tribunal: string | null;
  grau: string | null;
  classe: string | null;
  assuntos: string[];
  orgao: string | null;
  sistema: string | null;
  ajuizamento: string | null;
  sigilo: number | null;
  partes: ParteDjen[];
  advogados: AdvogadoDjen[];
  publicacoes: number;
  ultimaPublicacao: string | null;
  ultimaPublicacaoTipo: string | null;
  ultimaPublicacaoTexto: string | null;
  link: string | null;
  fontes: string[]; // de onde vieram os dados (DataJud, DJEN)
};

export type LeituraRobo = { sistema?: string; movs?: MovRobo[]; erro?: string | null; arquivado?: boolean };

export type Candidato = {
  id: string;
  numero_processo: string;
  numero_digitos: string;
  origem: "busca" | "djen";
  status: "lendo" | "pronto" | "erro" | "aprovado" | "descartado";
  resumo: ResumoCandidato;
  leitura: LeituraRobo | null;
  lido_em: string | null;
  tentativas: number;
  process_id: string | null;
  created_at: string;
};

const CAMPOS = "id, numero_processo, numero_digitos, origem, status, resumo, leitura, lido_em, tentativas, process_id, created_at";

/** Junta DataJud e DJEN (cada um com seu limite de tempo; o que falhar fica em branco). */
export async function montarResumo(numero: string): Promise<ResumoCandidato> {
  const [dj, pub] = await Promise.all([datajudResumo(numero).catch(() => null), djenPorNumero(numero).catch(() => null)]);
  return {
    tribunal: dj?.tribunal ?? pub?.tribunal ?? tribunalDoNumero(numero),
    grau: dj?.grau ?? null,
    classe: dj?.classe ?? pub?.classe ?? null,
    assuntos: dj?.assuntos ?? [],
    orgao: dj?.orgao ?? pub?.orgao ?? null,
    sistema: dj?.sistema ?? null,
    ajuizamento: dj?.ajuizamento ?? null,
    sigilo: dj?.sigilo ?? null,
    partes: pub?.partes ?? [],
    advogados: pub?.advogados ?? [],
    publicacoes: pub?.publicacoes ?? 0,
    ultimaPublicacao: pub?.ultimaPublicacao ?? null,
    ultimaPublicacaoTipo: pub?.ultimaPublicacaoTipo ?? null,
    ultimaPublicacaoTexto: pub?.ultimaPublicacaoTexto ?? null,
    link: pub?.link ?? null,
    fontes: [dj ? "DataJud" : null, pub ? "DJEN" : null].filter(Boolean) as string[],
  };
}

export type Aberto = { jaNoPortal: string } | { candidato: Candidato };

/** O que a lista da pesquisa (por nome, CPF/CNPJ ou OAB) já achou no diário oficial para um número. */
export type DicaCandidato = { numero: string; partes?: ParteDjen[]; advogados?: AdvogadoDjen[]; classe?: string | null; orgao?: string | null; tribunal?: string | null };

/** Completa o que ficou em branco no resumo com o que a pesquisa já tinha achado (nunca sobrescreve o que veio do tribunal). */
function completarResumo(r: ResumoCandidato, d?: Partial<ResumoCandidato> | DicaCandidato | null): ResumoCandidato {
  if (!d) return r;
  const partes = (d.partes ?? []).filter((p) => p && typeof p.nome === "string" && p.nome.trim()).map((p) => ({ nome: p.nome.trim().slice(0, 200), polo: p.polo ?? null })).slice(0, 40);
  const advogados = (d.advogados ?? []).filter((a) => a && typeof a.nome === "string" && a.nome.trim()).map((a) => ({ nome: a.nome.trim().slice(0, 200), oab: a.oab ?? null })).slice(0, 30);
  return {
    ...r,
    partes: r.partes.length ? r.partes : partes,
    advogados: r.advogados.length ? r.advogados : advogados,
    classe: r.classe ?? (d.classe ? String(d.classe).slice(0, 200) : null),
    orgao: r.orgao ?? (d.orgao ? String(d.orgao).slice(0, 200) : null),
    tribunal: r.tribunal ?? (d.tribunal ? String(d.tribunal).slice(0, 40) : null),
    fontes: r.fontes.length || !partes.length ? r.fontes : [...r.fontes, "DJEN"],
  };
}

/** Abre (ou reaproveita) o candidato de um número. Se o processo já está no portal, devolve o id dele. */
export async function abrirCandidato(numeroEntrada: string, origem: "busca" | "djen", pedidoPor: string | null, db: Db = createAdminClient(), dica?: DicaCandidato): Promise<Aberto> {
  const numero = mascaraCnj(numeroEntrada);
  if (!numero) throw new Error("Número CNJ inválido: precisa ter 20 dígitos (0000000-00.0000.0.00.0000).");
  const dig = numero.replace(/\D/g, "");

  const { data: proc } = await db.from("processes").select("id").eq("numero_digitos", dig).maybeSingle();
  if (proc) return { jaNoPortal: proc.id as string };

  const { data: aberto } = await db.from("processos_candidatos").select(CAMPOS).eq("numero_digitos", dig).in("status", ["lendo", "pronto", "erro"]).maybeSingle();
  if (aberto) {
    // já estava na fila mas sem partes: completa com o que a pesquisa de agora achou
    const r0 = aberto.resumo as ResumoCandidato | null;
    if (dica && r0 && !r0.partes?.length && dica.partes?.length) {
      await db.from("processos_candidatos").update({ resumo: completarResumo(r0, dica) }).eq("id", aberto.id);
    }
    // pesquisaram de novo um que deu erro: volta para a fila do robô
    if (aberto.status === "erro" && origem === "busca") {
      const { data } = await db.from("processos_candidatos").update({ status: "lendo", tentativas: 0, leitura: null }).eq("id", aberto.id).select(CAMPOS).single();
      return { candidato: data as Candidato };
    }
    return { candidato: aberto as Candidato };
  }

  const resumo = completarResumo(await montarResumo(numero), dica);
  const { data, error } = await db
    .from("processos_candidatos")
    .insert({ numero_processo: numero, numero_digitos: dig, origem, status: "lendo", resumo, pedido_por: pedidoPor })
    .select(CAMPOS)
    .single();
  if (error) {
    // corrida (dois pesquisaram ao mesmo tempo): pega o que entrou
    const { data: outro } = await db.from("processos_candidatos").select(CAMPOS).eq("numero_digitos", dig).in("status", ["lendo", "pronto", "erro"]).maybeSingle();
    if (outro) return { candidato: outro as Candidato };
    throw new Error(`Não foi possível guardar a pesquisa: ${error.message}`);
  }
  return { candidato: data as Candidato };
}

export async function listarCandidatosAbertos(db: Db = createAdminClient()): Promise<Candidato[]> {
  const { data } = await db.from("processos_candidatos").select(CAMPOS).in("status", ["lendo", "pronto", "erro"]).order("created_at", { ascending: false }).limit(200);
  return (data ?? []) as Candidato[];
}

export async function getCandidato(id: string, db: Db = createAdminClient()): Promise<Candidato | null> {
  const { data } = await db.from("processos_candidatos").select(CAMPOS).eq("id", id).maybeSingle();
  return (data as Candidato) ?? null;
}

const ordemPolo = (polo: string | null) => (polo === "Ativo" ? 0 : polo === "Passivo" ? 1 : 2);
const POLO_PORTAL = (polo: string | null): "ativo" | "passivo" | "outro" => (polo === "Ativo" ? "ativo" : polo === "Passivo" ? "passivo" : "outro");

export type OpcoesAprovar = { clientId: string | null; area: ProcessArea | null; responsibleId: string | null };

/** Cria o processo a partir do candidato e grava o histórico já lido. Devolve o id do processo. */
export async function aprovarCandidato(id: string, opcoes: OpcoesAprovar, decididoPor: string, db: Db = createAdminClient()): Promise<{ processId: string; andamentos: number; lendo: boolean }> {
  const c = await getCandidato(id, db);
  if (!c) throw new Error("Pesquisa não encontrada.");
  if (c.status === "aprovado" && c.process_id) return { processId: c.process_id, andamentos: 0, lendo: false };
  if (c.status === "descartado") throw new Error("Esse processo foi descartado. Pesquise de novo para incluir.");

  let r = c.resumo ?? ({} as ResumoCandidato);
  // sem partes na pesquisa: tenta de novo agora (o diário pode ter publicado algo depois)
  if (!r.partes?.length) r = completarResumo({ ...r, partes: r.partes ?? [], advogados: r.advogados ?? [], fontes: r.fontes ?? [] }, await montarResumo(c.numero_processo).catch(() => null));
  const partes = [
    ...(r.partes ?? []).map((p) => ({ nome: p.nome, papel: p.polo ?? "Parte", polo: POLO_PORTAL(p.polo) })),
    ...(r.advogados ?? []).map((a) => ({ nome: a.oab ? `${a.nome} (OAB ${a.oab})` : a.nome, papel: "Advogado", polo: "outro" as const })),
  ];
  const titulo = tituloDe([...(r.partes ?? [])].sort((a, b) => ordemPolo(a.polo) - ordemPolo(b.polo)), r.classe ?? null);
  const vara = [r.orgao, r.tribunal].filter(Boolean).join(" · ") || null;
  const instancia = r.grau?.startsWith("2") || r.grau === "Turma recursal" ? 2 : r.grau ? 1 : null;

  let processId: string;
  const { data: existente } = await db.from("processes").select("id").eq("numero_digitos", c.numero_digitos).maybeSingle();
  if (existente) {
    processId = existente.id as string;
    // o processo já estava no portal: preenche só o que está em branco (não apaga o que alguém editou)
    const { data: atual } = await db.from("processes").select("titulo, classe, vara_tribunal, partes, distribuido_em, instancia, client_id, responsible_id").eq("id", processId).maybeSingle();
    if (atual) {
      const vazio = (v: unknown) => v == null || v === "" || (Array.isArray(v) && !v.length);
      const patch = {
        ...(vazio(atual.titulo) && titulo ? { titulo } : {}),
        ...(vazio(atual.classe) && r.classe ? { classe: r.classe } : {}),
        ...(vazio(atual.vara_tribunal) && vara ? { vara_tribunal: vara } : {}),
        ...(vazio(atual.partes) && partes.length ? { partes } : {}),
        ...(vazio(atual.distribuido_em) && r.ajuizamento ? { distribuido_em: r.ajuizamento.slice(0, 10) } : {}),
        ...(vazio(atual.instancia) && instancia ? { instancia } : {}),
        ...(vazio(atual.client_id) && opcoes.clientId ? { client_id: opcoes.clientId } : {}),
        ...(vazio(atual.responsible_id) && opcoes.responsibleId ? { responsible_id: opcoes.responsibleId } : {}),
      };
      if (Object.keys(patch).length) await db.from("processes").update(patch).eq("id", processId);
    }
  } else {
    const { data: novo, error } = await db
      .from("processes")
      .insert({
        numero_processo: c.numero_processo,
        client_id: opcoes.clientId,
        area: opcoes.area ?? areaDe(r.classe ?? null, r.tribunal ?? null, c.numero_processo),
        status: "ativo",
        // título = polo ativo x polo passivo
        titulo,
        classe: r.classe ?? null,
        vara_tribunal: vara,
        partes,
        distribuido_em: r.ajuizamento ? r.ajuizamento.slice(0, 10) : null,
        instancia,
        responsible_id: opcoes.responsibleId,
        fonte: c.origem === "djen" ? "djen" : "pesquisa",
      })
      .select("id")
      .single();
    if (error || !novo) throw new Error(error?.code === "23505" ? "Esse processo já foi incluído por outra pessoa." : `Não foi possível criar o processo: ${error?.message}`);
    processId = novo.id as string;
  }

  await db.from("processos_candidatos").update({ status: "aprovado", process_id: processId, decidido_por: decididoPor, decidido_em: new Date().toISOString() }).eq("id", c.id);

  // histórico já lido pelo robô entra agora (processo sem histórico = tudo como histórico, sem aviso)
  let andamentos = 0;
  const movs = c.leitura?.movs ?? [];
  if (movs.length) {
    const g = await gravarDoRobo(c.numero_processo, c.leitura?.sistema ?? "robo", movs, db);
    andamentos = g.gravados;
  }
  await ligarPublicacoesAosProcessos(db).catch(() => undefined);
  return { processId, andamentos, lendo: c.status === "lendo" };
}

export async function descartarCandidato(id: string, decididoPor: string, db: Db = createAdminClient()): Promise<void> {
  await db
    .from("processos_candidatos")
    .update({ status: "descartado", decidido_por: decididoPor, decidido_em: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["lendo", "pronto", "erro"]);
}

/** Pede ao robô para ler de novo (ex.: deu erro de captcha). */
export async function lerDeNovo(id: string, db: Db = createAdminClient()): Promise<void> {
  await db.from("processos_candidatos").update({ status: "lendo", tentativas: 0, leitura: null }).eq("id", id).in("status", ["pronto", "erro"]);
}
