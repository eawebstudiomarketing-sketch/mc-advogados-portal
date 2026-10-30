import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { classeLegivel, datajudResumo, mascaraCnj, tribunalDoNumero } from "@/lib/processos-busca/fontes";

// Criar processo a partir do DJEN (30/10/2026). Peça que substitui o Astrea na DESCOBERTA de caso
// novo: quando chega uma publicação (pela OAB do escritório) de um número CNJ que o portal ainda não
// tem, cria o processo. Assim o portal passa a descobrir caso novo sozinho, no mesmo dia, nacional.
//  - só número CNJ de verdade (20 dígitos) e tribunal ≠ INPI (marca não é processo judicial);
//  - só com publicação recente (janela de dias) pra não ressuscitar caso antigo/arquivado;
//  - cliente fica em branco (o admin liga depois); fonte = "djen".
// Desde 30/10/2026 NÃO cria mais o processo direto: o número entra em "Aguardando aprovação"
// (processos_candidatos, origem "djen"), o robô lê no tribunal e alguém aprova em Novo processo.

type Db = SupabaseClient;

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Área do processo a partir da classe/tribunal da publicação (mesmo espírito do areaDe do Astrea). */
export function areaDe(classe: string | null, tribunal: string | null, numero: string): "trabalhista" | "consumidor" | "previdenciario" | "civel" | "empresarial" {
  const t = semAcento(`${classe ?? ""} ${tribunal ?? ""}`);
  const j = numero.replace(/\D/g, "")[13]; // 5 = Justiça do Trabalho
  if (/TRABALH|TRT|RECLAMA|RTORD|RTSUM/.test(t) || j === "5") return "trabalhista";
  if (/PREVIDENCI|INSS|APOSENTAD|BENEFICIO|LOAS|AUXILIO/.test(t)) return "previdenciario";
  if (/CONSUMIDOR|CDC/.test(t)) return "consumidor";
  if (/EMPRESARIAL|SOCIET|FALENCIA|RECUPERACAO JUDICIAL|MARCA|PROPRIEDADE INDUSTRIAL|EXECUCAO DE TITULO/.test(t)) return "empresarial";
  return "civel";
}

/** Título a partir das partes (autor x réu) ou da classe. */
export function tituloDe(partes: { nome?: string; polo?: string | null }[], classe: string | null): string | null {
  const nomes = (partes ?? []).map((p) => p.nome).filter(Boolean) as string[];
  if (nomes.length >= 2) return `${nomes[0]} x ${nomes[1]}`.slice(0, 300);
  if (nomes.length === 1) return nomes[0].slice(0, 300);
  return classe ? classe.slice(0, 300) : null;
}

export type ResultadoCriar = { criados: number; numeros: string[] };

const POLO: Record<string, string> = { A: "Ativo", P: "Passivo", T: "Terceiro", D: "Destinatário" };

/** Põe em "Aguardando aprovação" os números de publicações recentes que o portal ainda não tem. */
export async function criarProcessosDoDJEN(db: Db = createAdminClient(), janelaDias = 45): Promise<ResultadoCriar> {
  const corte = new Date(Date.now() - janelaDias * 86_400_000).toISOString().slice(0, 10);
  // publicações soltas, recentes, de número CNJ e não-INPI
  const { data: pubs } = await db
    .from("publicacoes")
    .select("numero_processo, numero_mascara, tribunal, orgao, classe, partes, data_disponibilizacao")
    .is("process_id", null)
    .neq("tribunal", "INPI")
    .gte("data_disponibilizacao", corte)
    .order("data_disponibilizacao", { ascending: false });

  const porNumero = new Map<string, NonNullable<typeof pubs>[number]>();
  for (const p of pubs ?? []) {
    const dig = (p.numero_processo ?? "").replace(/\D/g, "");
    if (dig.length === 20 && !porNumero.has(dig)) porNumero.set(dig, p);
  }
  if (!porNumero.size) return { criados: 0, numeros: [] };

  // tira os que já existem no portal e os que já passaram pela aprovação (inclusive descartados:
  // quem descartou não quer ver de novo; pesquisando à mão ele volta)
  const nums = [...porNumero.keys()];
  const [{ data: existentes }, { data: candidatos }] = await Promise.all([
    db.from("processes").select("numero_digitos").in("numero_digitos", nums),
    db.from("processos_candidatos").select("numero_digitos").in("numero_digitos", nums),
  ]);
  for (const e of [...(existentes ?? []), ...(candidatos ?? [])]) porNumero.delete(e.numero_digitos as string);
  if (!porNumero.size) return { criados: 0, numeros: [] };

  const ok: string[] = [];
  for (const [dig, p] of porNumero) {
    const numero = mascaraCnj(dig)!;
    const dj = await datajudResumo(numero, 20_000).catch(() => null);
    const partes = ((p!.partes as { nome?: string; polo?: string }[]) ?? []).filter((x) => x?.nome).map((x) => ({ nome: x.nome!, polo: POLO[x.polo ?? ""] ?? x.polo ?? null }));
    const resumo = {
      tribunal: dj?.tribunal ?? p!.tribunal ?? tribunalDoNumero(numero),
      grau: dj?.grau ?? null,
      classe: dj?.classe ?? classeLegivel(p!.classe),
      assuntos: dj?.assuntos ?? [],
      orgao: dj?.orgao ?? p!.orgao ?? null,
      sistema: dj?.sistema ?? null,
      ajuizamento: dj?.ajuizamento ?? null,
      sigilo: dj?.sigilo ?? null,
      partes,
      advogados: [],
      publicacoes: 1,
      ultimaPublicacao: p!.data_disponibilizacao ?? null,
      ultimaPublicacaoTipo: null,
      ultimaPublicacaoTexto: null,
      link: null,
      fontes: [dj ? "DataJud" : null, "DJEN"].filter(Boolean),
    };
    const { error } = await db.from("processos_candidatos").insert({ numero_processo: numero, numero_digitos: dig, origem: "djen", status: "lendo", resumo });
    if (!error) ok.push(dig);
  }
  return { criados: ok.length, numeros: ok };
}

/** Liga as publicações soltas aos processos recém-criados. */
export async function ligar(db: Db, numerosDigitos: string[]): Promise<void> {
  if (!numerosDigitos.length) return;
  const { data: procs } = await db.from("processes").select("id, numero_digitos, client_id").in("numero_digitos", numerosDigitos);
  for (const p of procs ?? []) {
    await db.from("publicacoes").update({ process_id: p.id, client_id: p.client_id }).eq("numero_processo", p.numero_digitos!).is("process_id", null);
  }
}
