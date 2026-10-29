import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarAvisos } from "@/lib/avisos";
import { BAIXADO, IMPORTANTE } from "./padroes";

// Andamentos lidos pelos robôs próprios, direto dos tribunais (29/10/2026). Enquanto o Astrea
// ainda roda em paralelo, os dois gravam no mesmo processo; para ninguém receber aviso em dobro:
//  - o robô só grava o andamento que ainda não existe (mesma data ±1 dia e texto equivalente);
//  - a leitura do Astrea pula o que o robô já trouxe (andamentoEquivalente, usado em sync.ts).
// Na 1ª leitura de cada processo, o que é anterior ao último andamento já conhecido entra como
// histórico (sem aviso); só o que é novo de verdade vira alerta.

type Db = SupabaseClient;
export type MovRobo = { data: string; texto: string };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palavras = (t: string) => semAcento(t).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 5);

/** Mesmo andamento visto por duas fontes (Astrea x tribunal)? Data ±1 dia e as primeiras palavras batem. */
export function andamentoEquivalente(a: { data: string; texto: string }, b: { data: string; texto: string }): boolean {
  const dias = Math.abs(Date.parse(a.data.slice(0, 10)) - Date.parse(b.data.slice(0, 10))) / 86_400_000;
  if (!(dias <= 1)) return false;
  const ta = semAcento(a.texto);
  const tb = semAcento(b.texto);
  // "Proferidas outras decisões" (Astrea) = documento "Decisão (Decisão)" na consulta pública do PJe
  const tipo = (t: string) => (/proferid|^documento:|\bdecisao\b|\bdespacho\b|\bsentenca\b/.test(t) ? (t.match(/decis|despacho|sentenc/)?.[0] ?? null) : null);
  if (tipo(ta) && tipo(ta) === tipo(tb) && (/proferid/.test(ta) || /proferid/.test(tb) || /documento:/.test(ta) || /documento:/.test(tb))) return true;
  const pa = palavras(a.texto);
  const pb = new Set(palavras(b.texto));
  if (!pa.length) return ta.trim() === tb.trim();
  const iguais = pa.filter((w) => pb.has(w)).length;
  return iguais >= Math.min(2, pa.length);
}

export type ResultadoRobo = { processo: string | null; recebidos: number; gravados: number; novos: number; jaExistiam: number };

/** Grava os andamentos que um robô leu de um processo. `numero` = número CNJ (com ou sem máscara). */
export async function gravarDoRobo(numero: string, sistema: string, movs: MovRobo[], db: Db = createAdminClient() as unknown as Db): Promise<ResultadoRobo> {
  const dig = numero.replace(/\D/g, "");
  const { data: p } = await db.from("processes").select("id, titulo, numero_processo, ultimo_andamento_em").eq("numero_digitos", dig).maybeSingle();
  const r: ResultadoRobo = { processo: p?.id ?? null, recebidos: movs.length, gravados: 0, novos: 0, jaExistiam: 0 };
  if (!p || !movs.length) return r;

  const { data: existentes } = await db.from("andamentos").select("data, descricao, externo_id").eq("process_id", p.id).order("data", { ascending: false }).limit(3000);
  const lista = (existentes ?? []).map((e) => ({ data: e.data as string, texto: e.descricao as string, externo: e.externo_id as string | null }));
  const primeiraVez = !lista.some((e) => e.externo?.startsWith("trib:"));
  const ultimoConhecido = lista.filter((e) => !e.externo?.startsWith("trib:")).map((e) => e.data.slice(0, 10)).sort().at(-1) ?? null;

  const linhas = [];
  for (const m of movs) {
    if (!m?.data || !m?.texto) continue;
    const dataIso = /T\d{2}:\d{2}/.test(m.data) ? `${m.data.slice(0, 16)}:00-03:00` : `${m.data.slice(0, 10)}T12:00:00-03:00`;
    const externo = `trib:${createHash("sha1").update(`${dig}|${m.data.slice(0, 16)}|${m.texto.trim()}`).digest("hex").slice(0, 24)}`;
    if (lista.some((e) => e.externo === externo || andamentoEquivalente(e, m))) {
      r.jaExistiam++;
      continue;
    }
    // 1ª leitura do processo: o que é anterior ao que já se conhecia é histórico (sem aviso)
    const novo = !primeiraVez || !ultimoConhecido || m.data.slice(0, 10) >= ultimoConhecido;
    linhas.push({
      process_id: p.id,
      data: dataIso,
      descricao: m.texto.trim().slice(0, 4000),
      tipo: "andamento",
      importante: IMPORTANTE.test(m.texto),
      fonte: "tribunal",
      externo_id: externo,
      situacao: novo && lista.length > 0 ? "novo" : "historico",
      bruto: { sistema, ...m },
    });
    lista.push({ data: dataIso, texto: m.texto, externo });
  }
  if (!linhas.length) return r;
  const { error } = await db.from("andamentos").upsert(linhas, { onConflict: "externo_id", ignoreDuplicates: true });
  if (error) throw new Error(`andamentos: ${error.message}`);
  r.gravados = linhas.length;
  const novos = linhas.filter((l) => l.situacao === "novo");
  r.novos = novos.length;

  const ultimo = linhas.map((l) => l.data).sort().at(-1)!;
  if (!p.ultimo_andamento_em || ultimo > p.ultimo_andamento_em) await db.from("processes").update({ ultimo_andamento_em: ultimo }).eq("id", p.id);

  if (novos.length) {
    const { data: admins } = await db.from("profiles").select("id").eq("role", "admin").eq("ativo", true).eq("oculto", false);
    const imp = novos.filter((l) => l.importante).length;
    const baixado = novos.some((l) => BAIXADO.test(l.descricao));
    await criarAvisos(
      (admins ?? []).map((a) => ({
        profile_id: a.id,
        tipo: "andamento",
        titulo: `Andamento recebido · ${(p.titulo || p.numero_processo || "processo").slice(0, 80)}`,
        corpo: `${novos.length} andamento(s) – ${imp} importante(s)${baixado ? " · possível arquivamento" : ""} (direto do tribunal)`,
        url: `/admin/alertas/andamentos/${p.id}`,
      }))
    ).catch(() => undefined);
  }
  return r;
}
