import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarPush, idsDosAdmins } from "@/lib/push";
import { htmlParaTexto } from "@/lib/astrea/texto";
import { ligarPublicacoesAosProcessos } from "@/lib/publicacoes/monitor";
import { listarPublicacoes, type PublicacaoAstrea, type SessaoAstrea, type StatusPublicacaoAstrea } from "@/lib/astrea/cliente";
import type { Json } from "@/lib/supabase/types";

// Publicações da tela "Publicações" do Astrea → tabela publicacoes do portal,
// com os mesmos campos que o Astrea mostra (divulgado/publicado, diário, órgão,
// nome pesquisado, responsável, texto com o nome destacado). Só leitura no Astrea.
//  - a mesma intimação que já veio pelo DJEN é completada, não duplicada;
//  - na primeira cópia a situação vem do Astrea; depois, se no portal ainda
//    estiver "não tratada" e no Astrea já foi tratada/descartada, segue o Astrea.

type Db = ReturnType<typeof createAdminClient>;
type Status = "nao_tratada" | "tratada" | "descartada";

const STATUS: Record<StatusPublicacaoAstrea, Status> = { RECEIVED: "nao_tratada", ASSIGNED: "tratada", REJECTED: "descartada" };

export type ResultadoPubAstrea = { lidas: number; novas: number; completadas: number; repetidas?: number };

const campo = (texto: string, rotulo: string) => new RegExp(`${rotulo}:\\s*(.+?)(?=\\s+[A-ZÀ-Ú][a-zà-ú ]+:|\\n|$)`).exec(texto)?.[1]?.trim() || null;

function partesDe(texto: string) {
  const out: { nome: string; polo: string }[] = [];
  for (const m of texto.matchAll(/Parte:\s*(.+?)\s+Polo:\s*(ATIVO|PASSIVO)/g)) out.push({ nome: m[1].trim(), polo: m[2] === "ATIVO" ? "A" : "P" });
  return out;
}

function linha(c: PublicacaoAstrea) {
  const html = c.clippingMatter ?? "";
  const texto = htmlParaTexto(html);
  const numero = c.clippingLawsuitNumber || c.lawsuitNumber || "";
  const diario = c.courtGazzete || null;
  return {
    astrea_id: String(c.astreaId ?? c.id),
    numero_digitos: numero.replace(/\D/g, ""),
    comunicacao_id: Number(/comunicacao_id:\s*(\d+)/.exec(texto)?.[1]) || null,
    astrea: {
      diario,
      nome_pesquisado: c.clippingSearchName,
      responsavel_nome: c.caseResponsibleName,
      titulo_processo: c.caseTitle,
      data_publicacao: c.clippingDate,
      texto_html: html || null,
      bruto: c as unknown as Json,
    },
    nova: {
      fonte: "astrea",
      numero_processo: numero.replace(/\D/g, "") || `ASTREA${c.id}`,
      numero_mascara: numero || null,
      tribunal: diario ? diario.replace(/DJ(EN|E|N)?$/i, "") || diario : null,
      orgao: c.courtFormatted || c.division,
      tipo_comunicacao: campo(texto, "Tipo de comunicação"),
      meio: campo(texto, "Meio"),
      link: /Inteiro teor:\s*(https?:\/\/\S+)/.exec(texto)?.[1] ?? null,
      classe: campo(texto, "Classe"),
      data_disponibilizacao: c.releaseDate,
      texto,
      partes: partesDe(texto),
      termo: c.clippingSearchName,
      status: STATUS[c.status] ?? "nao_tratada",
    },
  };
}

export async function sincronizarPublicacoesAstrea(
  s: SessaoAstrea,
  op: { completo?: boolean; db?: Db; processos?: Map<string, { id: string; client_id: string | null }> } = {}
): Promise<ResultadoPubAstrea> {
  const db = op.db ?? createAdminClient();
  const r: ResultadoPubAstrea = { lidas: 0, novas: 0, completadas: 0 };
  // não tratadas: todas; tratadas/descartadas: tudo no completo, só as recentes no de hora em hora
  const lotes = await Promise.all([
    listarPublicacoes(s, "RECEIVED", { maxPaginas: 20 }),
    listarPublicacoes(s, "ASSIGNED", { maxPaginas: op.completo ? 200 : 1 }),
    listarPublicacoes(s, "REJECTED", { maxPaginas: op.completo ? 200 : 1 }),
  ]);
  const todas = lotes.flat();
  r.lidas = todas.length;
  if (!todas.length) return r;

  let processos = op.processos;
  if (!processos) {
    const { data } = await db.from("processes").select("id, client_id, numero_digitos");
    processos = new Map((data ?? []).filter((p) => p.numero_digitos).map((p) => [p.numero_digitos!, p]));
  }

  const linhas = todas.map(linha);
  const [{ data: porAstrea }, { data: porComunicacao }, { data: porNumero }] = await Promise.all([
    db.from("publicacoes").select("id, astrea_id, status").in("astrea_id", linhas.map((l) => l.astrea_id)),
    db.from("publicacoes").select("id, comunicacao_id, astrea_id, status").in("comunicacao_id", linhas.map((l) => l.comunicacao_id).filter((x): x is number => !!x)),
    db
      .from("publicacoes")
      .select("id, numero_processo, data_disponibilizacao, astrea_id, status")
      .is("astrea_id", null)
      .in("numero_processo", [...new Set(linhas.map((l) => l.numero_digitos).filter(Boolean))]),
  ]);
  const jaAstrea = new Map((porAstrea ?? []).map((p) => [p.astrea_id!, p]));
  const jaComunicacao = new Map((porComunicacao ?? []).filter((p) => !p.astrea_id).map((p) => [Number(p.comunicacao_id), p]));
  const usadas = new Set<string>();

  const novasNaoTratadas: { id: string; tribunal: string | null; numero: string }[] = [];
  for (const l of linhas) {
    const existente =
      jaAstrea.get(l.astrea_id) ??
      (l.comunicacao_id ? jaComunicacao.get(l.comunicacao_id) : undefined) ??
      (porNumero ?? []).find((p) => !usadas.has(p.id) && p.numero_processo === l.numero_digitos && p.data_disponibilizacao === l.nova.data_disponibilizacao);

    if (existente) {
      usadas.add(existente.id);
      const seguirAstrea = existente.status === "nao_tratada" && l.nova.status !== "nao_tratada";
      const { error } = await db
        .from("publicacoes")
        .update({ astrea_id: l.astrea_id, ...l.astrea, ...(seguirAstrea ? { status: l.nova.status, tratada_em: new Date().toISOString() } : {}) })
        .eq("id", existente.id);
      if (error) throw new Error(`publicação ${l.nova.numero_mascara}: ${error.message}`);
      if (!jaAstrea.has(l.astrea_id)) r.completadas++;
      continue;
    }

    const proc = l.numero_digitos ? processos.get(l.numero_digitos) : undefined;
    const { data: nova, error } = await db
      .from("publicacoes")
      .insert({
        ...l.nova,
        ...l.astrea,
        astrea_id: l.astrea_id,
        comunicacao_id: l.comunicacao_id,
        process_id: proc?.id ?? null,
        client_id: proc?.client_id ?? null,
        // histórico copiado na primeira vez não deve disparar aviso
        avisada_em: op.completo || l.nova.status !== "nao_tratada" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) {
      // comunicacao_id já gravado por outra fonte no meio do caminho: só completa
      if (/duplicate key/i.test(error.message)) continue;
      throw new Error(`publicação ${l.nova.numero_mascara}: ${error.message}`);
    }
    r.novas++;
    if (!op.completo && l.nova.status === "nao_tratada") novasNaoTratadas.push({ id: nova.id, tribunal: l.nova.tribunal, numero: l.nova.numero_mascara ?? l.nova.numero_processo });
  }

  // publicações antigas (do DJEN) de processos que acabaram de chegar do Astrea
  await ligarPublicacoesAosProcessos(db).catch(() => 0);
  r.repetidas = await descartarRepetidas(db, [...new Set(linhas.map((l) => l.numero_digitos).filter(Boolean))]);

  if (novasNaoTratadas.length) {
    await db.from("publicacoes").update({ avisada_em: new Date().toISOString() }).in("id", novasNaoTratadas.map((n) => n.id));
    const primeira = novasNaoTratadas[0];
    await enviarPush(await idsDosAdmins(), {
      titulo: novasNaoTratadas.length === 1 ? "📰 Publicação nova" : `📰 ${novasNaoTratadas.length} publicações novas`,
      corpo: novasNaoTratadas.length === 1 ? `${primeira.tribunal ?? ""} · ${primeira.numero}` : [...new Set(novasNaoTratadas.map((n) => n.tribunal).filter(Boolean))].join(", "),
      url: novasNaoTratadas.length === 1 ? `/admin/publicacoes?p=${primeira.id}` : "/admin/publicacoes",
    }).catch(() => 0);
  }
  return r;
}

/**
 * O DJEN às vezes manda a mesma intimação duas vezes (uma por advogado); o Astrea
 * mostra uma só. A cópia idêntica (mesmo processo, dia e texto) de uma publicação
 * já ligada ao Astrea fica como descartada (não é apagada, senão o DJEN grava de novo).
 */
async function descartarRepetidas(db: Db, numeros: string[]): Promise<number> {
  if (!numeros.length) return 0;
  const { data } = await db.from("publicacoes").select("id, numero_processo, data_disponibilizacao, texto, astrea_id, status").in("numero_processo", numeros);
  const comAstrea = (data ?? []).filter((p) => p.astrea_id);
  const repetidas = (data ?? []).filter(
    (p) =>
      !p.astrea_id &&
      p.status === "nao_tratada" &&
      comAstrea.some((a) => a.numero_processo === p.numero_processo && a.data_disponibilizacao === p.data_disponibilizacao && (a.texto ?? "").trim() === (p.texto ?? "").trim())
  );
  if (repetidas.length) await db.from("publicacoes").update({ status: "descartada", tratada_em: new Date().toISOString() }).in("id", repetidas.map((p) => p.id));
  return repetidas.length;
}
