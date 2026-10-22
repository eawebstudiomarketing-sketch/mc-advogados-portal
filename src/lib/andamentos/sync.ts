import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";
import { criarAvisos } from "@/lib/avisos";
import { htmlParaTexto, temHtml } from "@/lib/astrea/texto";
import { sincronizarPublicacoesAstrea, type ResultadoPubAstrea } from "@/lib/publicacoes/astrea";
import { BAIXADO } from "./padroes";
import { entrarNoAstrea, historicoDoCaso, listarAlertas, listarCasos, pastaDoCaso, type CasoAstrea, type HistoricoAstrea, type PastaAstrea, type SessaoAstrea } from "@/lib/astrea/cliente";

// Copia processos e andamentos do Astrea para o portal.
//  - completo: todos os processos (ativos e, se pedido, arquivados) com a capa e
//    o histórico inteiro, gravado como "histórico" (não gera aviso);
//  - incremental (de hora em hora): só os processos que mexeram desde a última
//    leitura; andamento/publicação novo entra como "novo" e avisa a equipe.

type Db = ReturnType<typeof createAdminClient>;
type Area = "trabalhista" | "consumidor" | "previdenciario" | "civel" | "empresarial";
type ProcessoPortal = { id: string; numero_digitos: string | null; astrea_id: string | null; client_id: string | null; titulo: string | null };

export type ResultadoSync = { processos: number; novosProcessos: number; novos: number; historico: number; publicacoes?: ResultadoPubAstrea; erro?: string };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
const limpaNome = (t: string) =>
  semAcento(t)
    .toUpperCase()
    .replace(/\s*-\s*(CPF|CNPJ)\s*:.*$/, "")
    .replace(/\b(LTDA|ME|EPP|EIRELI|S\/?A|SA)\b\.?/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function areaDe(c: { court?: string | null; lawsuitType?: string | null; number?: string | null }): Area {
  const t = semAcento(`${c.court ?? ""} ${c.lawsuitType ?? ""}`).toUpperCase();
  const dig = (c.number ?? "").replace(/\D/g, "");
  if (/TRABALH|TRT|RECLAMA/.test(t) || dig[13] === "5") return "trabalhista";
  if (/PREVIDENCI|INSS|APOSENTADORIA|BENEFICIO/.test(t)) return "previdenciario";
  if (/CONSUMIDOR/.test(t)) return "consumidor";
  if (/EMPRESARIAL|SOCIET|FALENCIA|RECUPERACAO JUDICIAL|MARCA|PROPRIEDADE INDUSTRIAL/.test(t)) return "empresarial";
  return "civel";
}

const tipoDe = (h: HistoricoAstrea) =>
  h.type === "AUTOMATIC_LAWSUIT"
    ? "andamento"
    : h.type === "CLIPPING"
      ? "publicacao"
      : /TASK/.test(h.type)
        ? "tarefa"
        : h.type === "APPOINTMENT"
          ? "compromisso"
          : "nota";

function polo(roleType: number, papel: string) {
  if (roleType === 0 || /autor|reclamante|requerente|exequente|impetrante|apelante|embargante/i.test(papel)) return "ativo";
  if (roleType === 1 || /r[ée]u|reclamad|requerid|executad|impetrad|apelad|embargad/i.test(papel)) return "passivo";
  return "outro";
}

/** Cliente do portal pelo nome do cliente no Astrea (igual ou contido). */
function casarCliente(nome: string | null, clientes: { id: string; chaves: string[] }[]): string | null {
  if (!nome) return null;
  const n = limpaNome(nome);
  if (n.length < 4) return null;
  const achados = clientes.filter((c) => c.chaves.some((k) => k === n || (k.length >= 6 && (n.includes(k) || k.includes(n)))));
  return achados.length === 1 ? achados[0].id : null;
}

function linhaProcesso(c: CasoAstrea, pasta: PastaAstrea | null) {
  const pessoas = [...(pasta?.customer ? [pasta.customer] : []), ...(pasta?.stakeholders ?? [])];
  return {
    astrea_id: c.id,
    titulo: (pasta?.title ?? c.title ?? "").replace(/\s*-\s*(CPF|CNPJ):\s*[\d./-]+/g, "").slice(0, 400) || null,
    cliente_nome: (pasta?.customer?.contactName ?? c.customer ?? "").replace(/\s*-\s*(CPF|CNPJ):.*$/, "") || null,
    classe: (pasta?.lawsuitTypeName ?? c.lawsuitType ?? "").replace(/\s+/g, " ").trim().slice(0, 500) || null,
    partes: pessoas.map((p) => ({ nome: p.contactName, papel: p.stakeholderRoleName, polo: polo(p.roleType, p.stakeholderRoleName) })),
    valor_causa: c.amount || pasta?.amount || null,
    distribuido_em: c.distribuitionDate ?? (pasta?.openDate ? new Date(pasta.openDate).toISOString().slice(0, 10) : null),
    instancia: c.currentInstanceNumber ?? pasta?.currentInstanceNumber ?? null,
    responsavel_nome: pasta?.responsible?.name ?? null,
    fonte: "astrea",
  };
}

async function gravarAndamentos(db: Db, processId: string, hs: HistoricoAstrea[], situacaoNovos: "novo" | "historico") {
  if (!hs.length) return { novos: 0, historico: 0, linhas: [] as { descricao: string; importante: boolean; tipo: string }[] };
  const linhas = hs.map((h) => {
    const tipo = tipoDe(h);
    // texto inteiro, sem cortar; publicação vem em HTML e o original fica em descricao_html
    const descricao = htmlParaTexto(h.description) || "(sem descrição)";
    // publicação nova avisa pela tela Publicações; aqui só andamento do tribunal
    const alerta = situacaoNovos === "novo" && tipo === "andamento";
    return {
      process_id: processId,
      data: h.date,
      descricao: tipo === "tarefa" ? `Tarefa concluída${h.responsibleName ? ` (${h.responsibleName})` : ""}: ${descricao}` : descricao,
      tipo,
      // mesma marcação do Astrea (sem regra própria), para bater com "N andamentos – X importantes"
      importante: !!h.important,
      fonte: "astrea",
      externo_id: `astrea:${h.id}`,
      situacao: (alerta ? "novo" : "historico") as "novo" | "historico",
      descricao_html: temHtml(h.description) ? h.description : null,
      responsavel_nome: h.responsibleName ?? null,
      etiquetas: (h.tagDtos ?? []).map((t) => ({ label: t.label, color: t.color ?? null })),
      bruto: h as unknown as Json,
    };
  });
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await db.from("andamentos").upsert(linhas.slice(i, i + 500), { onConflict: "externo_id", ignoreDuplicates: true });
    if (error) throw new Error(`andamentos: ${error.message}`);
  }
  const novos = linhas.filter((l) => l.situacao === "novo");
  return { novos: novos.length, historico: linhas.length - novos.length, linhas: novos };
}

export async function sincronizarAstrea(op: { completo?: boolean; arquivados?: boolean; origem?: string; log?: (m: string) => void } = {}): Promise<ResultadoSync> {
  const db = createAdminClient();
  const log = op.log ?? (() => undefined);
  const r: ResultadoSync = { processos: 0, novosProcessos: 0, novos: 0, historico: 0 };
  const { data: exec } = await db.from("andamentos_sync").insert({ origem: op.origem ?? "cron" }).select("id").single();
  try {
    const s: SessaoAstrea = await entrarNoAstrea();
    const [{ data: procs }, { data: clientes }, { data: ultima }] = await Promise.all([
      db.from("processes").select("id, numero_digitos, astrea_id, client_id, titulo"),
      db.from("clients").select("id, name"),
      db.from("andamentos_sync").select("iniciado_em").is("erro", null).gt("processos", 0).order("iniciado_em", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const porAstrea = new Map((procs ?? []).filter((p) => p.astrea_id).map((p) => [p.astrea_id!, p as ProcessoPortal]));
    const porNumero = new Map((procs ?? []).filter((p) => p.numero_digitos).map((p) => [p.numero_digitos!, p as ProcessoPortal]));
    const chavesClientes = (clientes ?? []).map((c) => ({
      id: c.id,
      chaves: [c.name, ...(c.name.match(/\(([^)]+)\)/g) ?? []).map((x) => x.slice(1, -1)), c.name.replace(/\(.*?\)/g, "")].map(limpaNome).filter((x) => x.length >= 4),
    }));

    // incremental: só o que mexeu desde 2 dias antes da última leitura boa
    const desde = !op.completo && ultima?.iniciado_em ? new Date(Date.parse(ultima.iniciado_em) - 2 * 86_400_000).toISOString().slice(0, 10) : undefined;
    const casos = [
      ...(await listarCasos(s, { ate: desde, status: "Active" })),
      ...(op.completo && op.arquivados ? await listarCasos(s, { status: "Archived" }) : []),
    ];
    log(`${casos.length} processo(s) para ler${desde ? ` (mexidos desde ${desde})` : ""}`);

    const avisos: { processId: string; titulo: string; n: number; imp: number; baixado: boolean }[] = [];
    const falhas: string[] = [];
    for (const c of casos) {
      r.processos++;
      try {
      const dig = (c.number ?? "").replace(/\D/g, "");
      let p = porAstrea.get(c.id) ?? (dig ? porNumero.get(dig) : undefined);
      const novoNoPortal = !p || !p.astrea_id;
      if (novoNoPortal || op.completo) {
        const pasta = await pastaDoCaso(s, c.id).catch(() => null);
        const dados = linhaProcesso(c, pasta);
        if (p) {
          // processo já existia (cadastrado à mão): completa a capa sem mexer no cliente
          await db.from("processes").update(dados).eq("id", p.id);
          if (!p.client_id) {
            const cid = casarCliente(dados.cliente_nome, chavesClientes);
            if (cid) await db.from("processes").update({ client_id: cid }).eq("id", p.id);
          }
        } else {
          const numero = c.number?.trim() || `ASTREA-${c.id}`;
          const { data: novo, error } = await db
            .from("processes")
            .insert({
              ...dados,
              numero_processo: numero,
              vara_tribunal: c.court ?? pasta?.courtName ?? null,
              area: areaDe(c),
              status: c.active === false ? "arquivado" : "ativo",
              client_id: casarCliente(dados.cliente_nome, chavesClientes),
            })
            .select("id, numero_digitos, astrea_id, client_id, titulo")
            .single();
          if (error) throw new Error(`processo ${numero}: ${error.message}`);
          p = novo as ProcessoPortal;
          r.novosProcessos++;
          // o Astrea pode ter 2 pastas com o mesmo número: a segunda junta o histórico neste processo
          if (p.numero_digitos) porNumero.set(p.numero_digitos, p);
        }
        porAstrea.set(c.id, { ...p!, astrea_id: c.id });
      }

      // histórico: no completo/novo, tudo como histórico; no incremental, só o que não temos
      const { data: conhecidos } = await db.from("andamentos").select("externo_id").eq("process_id", p!.id).like("externo_id", "astrea:%").order("data", { ascending: false }).limit(300);
      const ids = new Set((conhecidos ?? []).map((x) => x.externo_id!.slice(7)));
      const hs = await historicoDoCaso(s, c.id, { conhecidos: novoNoPortal || op.completo ? undefined : ids, maxPaginas: novoNoPortal || op.completo ? 30 : 3 });
      const frescos = hs.filter((h) => !ids.has(String(h.id)));
      const g = await gravarAndamentos(db, p!.id, frescos, novoNoPortal || op.completo ? "historico" : "novo");
      r.novos += g.novos;
      r.historico += g.historico;
      const ultimoEm = hs.map((h) => h.date).sort().at(-1);
      if (ultimoEm) await db.from("processes").update({ ultimo_andamento_em: ultimoEm }).eq("id", p!.id).lt("ultimo_andamento_em", ultimoEm);
      if (ultimoEm) await db.from("processes").update({ ultimo_andamento_em: ultimoEm }).eq("id", p!.id).is("ultimo_andamento_em", null);
      if (g.novos) {
        avisos.push({
          processId: p!.id,
          titulo: p!.titulo || c.title || c.number || "processo",
          n: g.novos,
          imp: g.linhas.filter((l) => l.importante).length,
          baixado: g.linhas.some((l) => BAIXADO.test(l.descricao)),
        });
      }
      } catch (e) {
        // um processo com problema não derruba a leitura dos outros
        falhas.push(`${c.number ?? c.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (r.processos % 20 === 0) log(`${r.processos}/${casos.length} · ${r.novosProcessos} novos processos · ${r.historico} registros`);
    }

    if (avisos.length) await avisar(db, avisos);
    if (falhas.length) {
      log(`${falhas.length} processo(s) com falha: ${falhas.join(" | ")}`);
      r.erro = `${falhas.length} processo(s) não lidos: ${falhas.slice(0, 3).join(" | ")}`.slice(0, 900);
    }

    // cópia completa: o que está como "Andamento recebido" pendente no Astrea fica não tratado aqui também
    if (op.completo) {
      const n = await marcarPendentesDoAstrea(db, s, porAstrea);
      log(`${n} andamento(s) pendente(s) no Astrea marcados como não tratados`);
    }

    // publicações da tela Publicações do Astrea (inclusive de processo ainda não cadastrado)
    const procsAtuais = new Map([...porAstrea.values()].concat([...porNumero.values()]).filter((x) => x.numero_digitos).map((x) => [x.numero_digitos!, x]));
    r.publicacoes = await sincronizarPublicacoesAstrea(s, { completo: op.completo, db, processos: procsAtuais });
    log(`publicações: ${r.publicacoes.lidas} lidas · ${r.publicacoes.novas} novas · ${r.publicacoes.completadas} completadas (já vindas do DJEN)`);
  } catch (e) {
    r.erro = e instanceof Error ? e.message : String(e);
  }
  if (exec) await db.from("andamentos_sync").update({ processos: r.processos, novos: r.novos, erro: r.erro ?? null }).eq("id", exec.id);
  return r;
}

async function avisar(db: Db, avisos: { processId: string; titulo: string; n: number; imp: number; baixado: boolean }[]) {
  const { data: admins } = await db.from("profiles").select("id").eq("role", "admin").eq("ativo", true).eq("oculto", false);
  const para = (admins ?? []).map((a) => a.id);
  const linhas =
    avisos.length > 4
      ? [{ titulo: `${avisos.reduce((t, a) => t + a.n, 0)} andamento(s) novo(s) em ${avisos.length} processos`, corpo: `${avisos.reduce((t, a) => t + a.imp, 0)} importante(s).`, url: "/admin/alertas?aba=andamentos" }]
      : avisos.map((a) => ({
          titulo: `Andamento recebido · ${a.titulo.slice(0, 80)}`,
          corpo: `${a.n} andamento(s) – ${a.imp} importante(s)${a.baixado ? " · possível arquivamento" : ""}`,
          url: `/admin/alertas/andamentos/${a.processId}`,
        }));
  await criarAvisos(para.flatMap((profile_id) => linhas.map((l) => ({ profile_id, tipo: "andamento", ...l })))).catch(() => undefined);
}

/**
 * Alertas pendentes no Astrea → mesmo estado e mesma hora de chegada aqui:
 *  - "Andamento recebido" diz o processo e quantos andamentos: os mais novos dele viram "novo";
 *  - "Publicação recebida" dá a hora em que a publicação chegou.
 */
export async function marcarPendentesDoAstrea(db: Db, s: SessaoAstrea, porAstrea?: Map<string, ProcessoPortal>): Promise<number> {
  const alertas = await listarAlertas(s);
  let total = 0;
  for (const a of alertas) {
    if (a.type === "NEW_CLIPPING") {
      await db.from("publicacoes").update({ created_at: a.arriveDate }).eq("astrea_id", String(a.objectId ?? ""));
      continue;
    }
    if (a.type !== "NEW_HISTORY") continue;
    let c: { caseId?: number; importantCount?: number; othersCount?: number } = {};
    try {
      c = JSON.parse(a.contents || "{}");
    } catch {}
    if (!c.caseId) continue;
    let p = porAstrea?.get(String(c.caseId));
    if (!p) {
      const { data } = await db.from("processes").select("id, numero_digitos, astrea_id, client_id, titulo").eq("astrea_id", String(c.caseId)).maybeSingle();
      p = (data as ProcessoPortal | null) ?? undefined;
    }
    const n = (c.importantCount ?? 0) + (c.othersCount ?? 0);
    if (!p || !n) continue;
    const { data } = await db.from("andamentos").select("id").eq("process_id", p.id).eq("tipo", "andamento").order("data", { ascending: false }).limit(n);
    const ids = (data ?? []).map((x) => x.id);
    if (!ids.length) continue;
    await db.from("andamentos").update({ situacao: "novo", created_at: a.arriveDate }).in("id", ids).in("situacao", ["historico", "novo"]);
    total += ids.length;
  }
  return total;
}
