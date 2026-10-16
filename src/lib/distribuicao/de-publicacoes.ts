import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sugerir, dataPublicacao } from "@/lib/publicacoes/sugestoes";
import { getEscritorioConfig, listPessoas, sugerirResponsavel } from "@/lib/data/escritorio";

// Publicação nova (DJEN/INPI) também vira sugestão na Distribuição, já com
// prazo/audiência calculados, área e responsável. Tratar ou descartar de um
// lado reflete no outro (gatilho da migration 0024).

type Db = ReturnType<typeof createAdminClient>;

const AREA_DO_PROCESSO: Record<string, string> = {
  trabalhista: "Trabalhista",
  empresarial: "Empresarial",
  civel: "Cível",
  consumidor: "Consumidor",
  previdenciario: "Previdenciário",
};

/** Cria as sugestões das publicações não tratadas que chegaram nas últimas `horas`. */
export async function distribuirPublicacoesNovas(db: Db = createAdminClient(), horas = 30): Promise<number> {
  const desde = new Date(Date.now() - horas * 3_600_000).toISOString();
  const { data: pubs } = await db
    .from("publicacoes")
    .select("id, numero_processo, numero_mascara, tribunal, orgao, tipo_comunicacao, tipo_documento, data_disponibilizacao, texto, client_id, process_id, processes(area)")
    .eq("status", "nao_tratada")
    .gte("created_at", desde)
    .limit(200);
  if (!pubs?.length) return 0;

  const { data: ja } = await db
    .from("distribuicao")
    .select("publicacao_id")
    .in(
      "publicacao_id",
      pubs.map((p) => p.id)
    );
  const feitas = new Set((ja ?? []).map((d) => d.publicacao_id));
  const faltam = pubs.filter((p) => !feitas.has(p.id));
  if (!faltam.length) return 0;

  const [config, pessoas] = await Promise.all([getEscritorioConfig(), listPessoas()]);
  const naLista = (a: string) => config.areas.find((x) => x.toLowerCase() === a.toLowerCase()) ?? null;
  const linhas = [];
  for (const p of faltam) {
    const inpi = p.tribunal === "INPI";
    const codigos = inpi ? (p.tipo_documento ?? "").split(/,\s*/) : undefined;
    const s = sugerir(p.texto ?? "", p.data_disponibilizacao, { tribunal: p.tribunal, codigos })[0];
    const numero = `${inpi ? "INPI " : ""}${p.numero_mascara ?? p.numero_processo}`;
    const acao = (p.tipo_comunicacao ?? "intimação").toLowerCase();
    const titulo =
      s?.tipo === "audiencia"
        ? `Audiência${s.hora ? ` às ${s.hora}` : ""} — ${numero}`
        : s?.tipo === "prazo"
          ? `Prazo ${s.dias} dias: ${s.acao ?? acao} — ${numero}`
          : `Publicação: ${acao} — ${numero}`;
    const areaProc = (p.processes as unknown as { area: string } | null)?.area;
    const area = inpi
      ? naLista("Marcas e Patentes")
      : /^TRT/i.test(p.tribunal ?? "")
        ? naLista("Trabalhista")
        : areaProc
          ? naLista(AREA_DO_PROCESSO[areaProc] ?? "")
          : null;
    linhas.push({
      origem: "publicacao",
      publicacao_id: p.id,
      client_id: p.client_id,
      titulo: titulo.slice(0, 200),
      descricao: `Publicação ${inpi ? "na RPI" : "no DJEN"} de ${p.data_disponibilizacao.split("-").reverse().join("/")} (publicada em ${dataPublicacao(p.data_disponibilizacao).split("-").reverse().join("/")}) · ${p.tribunal ?? ""} · ${p.orgao ?? ""}`,
      area,
      tipo: "processo",
      prioridade: s ? "alta" : "media",
      prazo_sugerido: s?.tipo === "prazo" ? s.vencimento : s?.tipo === "audiencia" ? s.data : null,
      responsavel_sugerido: await sugerirResponsavel(area, pessoas, p.client_id),
      trechos: [{ texto: (p.texto ?? "").slice(0, 700), quem: [p.tribunal, p.orgao].filter(Boolean).join(" · "), em: p.data_disponibilizacao }] as unknown as never,
    });
  }
  const { error } = await db.from("distribuicao").insert(linhas);
  if (error) {
    console.error("distribuição de publicações:", error.message);
    return 0;
  }
  return linhas.length;
}
