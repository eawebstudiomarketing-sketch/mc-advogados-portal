import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// Criar processo a partir do DJEN (30/10/2026). Peça que substitui o Astrea na DESCOBERTA de caso
// novo: quando chega uma publicação (pela OAB do escritório) de um número CNJ que o portal ainda não
// tem, cria o processo. Assim o portal passa a descobrir caso novo sozinho, no mesmo dia, nacional.
//  - só número CNJ de verdade (20 dígitos) e tribunal ≠ INPI (marca não é processo judicial);
//  - só com publicação recente (janela de dias) pra não ressuscitar caso antigo/arquivado;
//  - cliente fica em branco (o admin liga depois); fonte = "djen".

type Db = SupabaseClient;

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Área do processo a partir da classe/tribunal da publicação (mesmo espírito do areaDe do Astrea). */
function areaDe(classe: string | null, tribunal: string | null, numero: string): "trabalhista" | "consumidor" | "previdenciario" | "civel" | "empresarial" {
  const t = semAcento(`${classe ?? ""} ${tribunal ?? ""}`);
  const j = numero.replace(/\D/g, "")[13]; // 5 = Justiça do Trabalho
  if (/TRABALH|TRT|RECLAMA|RTORD|RTSUM/.test(t) || j === "5") return "trabalhista";
  if (/PREVIDENCI|INSS|APOSENTAD|BENEFICIO|LOAS|AUXILIO/.test(t)) return "previdenciario";
  if (/CONSUMIDOR|CDC/.test(t)) return "consumidor";
  if (/EMPRESARIAL|SOCIET|FALENCIA|RECUPERACAO JUDICIAL|MARCA|PROPRIEDADE INDUSTRIAL|EXECUCAO DE TITULO/.test(t)) return "empresarial";
  return "civel";
}

/** Título a partir das partes (autor x réu) ou da classe. */
function tituloDe(partes: { nome?: string; polo?: string }[], classe: string | null): string | null {
  const nomes = (partes ?? []).map((p) => p.nome).filter(Boolean) as string[];
  if (nomes.length >= 2) return `${nomes[0]} x ${nomes[1]}`.slice(0, 300);
  if (nomes.length === 1) return nomes[0].slice(0, 300);
  return classe ? classe.slice(0, 300) : null;
}

export type ResultadoCriar = { criados: number; numeros: string[] };

/** Cria processos para publicações recentes de números que o portal ainda não tem. */
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

  // tira os que já existem (criados pelo Astrea ou à mão)
  const { data: existentes } = await db.from("processes").select("numero_digitos").in("numero_digitos", [...porNumero.keys()]);
  for (const e of existentes ?? []) porNumero.delete(e.numero_digitos as string);
  if (!porNumero.size) return { criados: 0, numeros: [] };

  const linhas = [...porNumero.values()].map((p) => ({
    numero_processo: p!.numero_mascara ?? p!.numero_processo,
    area: areaDe(p!.classe, p!.tribunal, p!.numero_processo),
    status: "ativo",
    titulo: tituloDe((p!.partes as { nome?: string; polo?: string }[]) ?? [], p!.classe),
    classe: p!.classe ?? null,
    vara_tribunal: p!.orgao ?? p!.tribunal ?? null,
    partes: (p!.partes as unknown) ?? [],
    distribuido_em: null as string | null,
    fonte: "djen",
  }));

  const { data: criados, error } = await db.from("processes").insert(linhas).select("id, numero_digitos");
  if (error) {
    // se a inserção em lote falhar (ex.: um número duplicado por corrida), tenta um a um
    const ok: string[] = [];
    for (const l of linhas) {
      const { data } = await db.from("processes").insert(l).select("numero_digitos").maybeSingle();
      if (data?.numero_digitos) ok.push(data.numero_digitos as string);
    }
    await ligar(db, ok);
    return { criados: ok.length, numeros: ok };
  }
  const nums = (criados ?? []).map((c) => c.numero_digitos as string);
  await ligar(db, nums);
  return { criados: nums.length, numeros: nums };
}

/** Liga as publicações soltas aos processos recém-criados. */
async function ligar(db: Db, numerosDigitos: string[]): Promise<void> {
  if (!numerosDigitos.length) return;
  const { data: procs } = await db.from("processes").select("id, numero_digitos, client_id").in("numero_digitos", numerosDigitos);
  for (const p of procs ?? []) {
    await db.from("publicacoes").update({ process_id: p.id, client_id: p.client_id }).eq("numero_processo", p.numero_digitos!).is("process_id", null);
  }
}
