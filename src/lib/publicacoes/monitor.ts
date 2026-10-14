import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { enviarPush, idsDosAdmins } from "@/lib/push";
import { buscarPorOab, textoLimpo, type ComunicacaoDJEN } from "./djen";
import { ufDaPublicacao } from "./uf";
import { dataPublicacao, sugerir } from "./sugestoes";
import { idPublicacaoINPI, lerRevista, textoDoProcesso, ultimaRevista } from "./inpi";

// Robô de publicações: busca no DJEN as intimações dos últimos dias para cada
// OAB cadastrada, grava só as novas (o id da comunicação no DJEN é único),
// liga ao processo/cliente pelo número e manda UM e-mail com as novas.
// Roda pelo cron (07h e 13h da Bahia) ou pelo botão "Buscar agora".

const JANELA_DIAS = 10; // relê alguns dias para trás: tribunal às vezes publica com atraso
const JANELA_CARGA_INICIAL = 30; // primeira busca: traz o último mês, sem mandar e-mail
type Db = ReturnType<typeof createAdminClient>;

const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const menosDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br").replace(/\/$/, "");
const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

/** Liga publicações ainda soltas aos processos cadastrados com o mesmo número. */
export async function ligarPublicacoesAosProcessos(db: Db = createAdminClient()): Promise<number> {
  const { data: soltas } = await db.from("publicacoes").select("numero_processo").is("process_id", null);
  const numeros = [...new Set((soltas ?? []).map((s) => s.numero_processo))];
  if (!numeros.length) return 0;
  const { data: processos } = await db.from("processes").select("id, client_id, numero_digitos").in("numero_digitos", numeros);
  let ligadas = 0;
  for (const p of processos ?? []) {
    const { count } = await db
      .from("publicacoes")
      .update({ process_id: p.id, client_id: p.client_id }, { count: "exact" })
      .eq("numero_processo", p.numero_digitos!)
      .is("process_id", null);
    ligadas += count ?? 0;
  }
  return ligadas;
}

/** Preenche o estado (UF) das publicações gravadas antes dessa coluna existir. */
async function completarUf(db: Db): Promise<void> {
  const { data, error } = await db.from("publicacoes").select("id, numero_processo, orgao").is("uf", null).limit(500);
  if (error) return; // coluna ainda não existe (migration 0019 pendente)
  for (const p of data ?? []) {
    const uf = ufDaPublicacao(p.numero_processo, p.orgao);
    if (uf) await db.from("publicacoes").update({ uf }).eq("id", p.id);
  }
}

export type ResultadoMonitor = {
  encontradas: number;
  novas: number;
  inpiRevista: number | null;
  inpiNovas: number;
  emailPara: string | null;
  erro: string | null;
};

const CAMPOS_NOVA = "id, numero_mascara, numero_processo, tribunal, orgao, tipo_comunicacao, data_disponibilizacao, texto, client_id, clients(name)";

export async function executarMonitor(origem: "cron" | "manual"): Promise<ResultadoMonitor> {
  const db = createAdminClient();
  const fim = hojeBahia();
  const { count: jaTem } = await db.from("publicacoes").select("id", { count: "exact", head: true }).neq("tribunal", "INPI");
  const cargaInicial = !jaTem;
  const inicio = menosDias(fim, cargaInicial ? JANELA_CARGA_INICIAL : JANELA_DIAS);
  const resultado: ResultadoMonitor = { encontradas: 0, novas: 0, inpiRevista: null, inpiNovas: 0, emailPara: null, erro: null };
  const erros: string[] = [];
  const paraAvisar: Nova[] = [];

  // 1) DJEN — intimações pelas OABs
  try {
    const { data: oabs } = await db.from("monitor_oabs").select("numero, uf").eq("ativo", true);
    const porId = new Map<number, { c: ComunicacaoDJEN; termo: string }>();
    for (const o of oabs ?? []) {
      const itens = await buscarPorOab(o.numero, o.uf, inicio, fim);
      for (const c of itens) if (!porId.has(c.id)) porId.set(c.id, { c, termo: `${o.numero}/${o.uf}` });
    }
    resultado.encontradas = porId.size;

    const ids = [...porId.keys()];
    const { data: ja } = ids.length
      ? await db.from("publicacoes").select("comunicacao_id").in("comunicacao_id", ids)
      : { data: [] as { comunicacao_id: number }[] };
    const existentes = new Set((ja ?? []).map((j) => j.comunicacao_id));
    const novas = [...porId.values()].filter(({ c }) => !existentes.has(c.id));

    if (novas.length) {
      const numeros = [...new Set(novas.map(({ c }) => c.numero_processo))];
      const { data: processos } = await db.from("processes").select("id, client_id, numero_digitos").in("numero_digitos", numeros);
      const proc = new Map((processos ?? []).map((p) => [p.numero_digitos!, p]));

      const linhas = novas.map(({ c, termo }) => {
        const p = proc.get(c.numero_processo);
        const texto = textoLimpo(c.texto);
        return {
          comunicacao_id: c.id,
          numero_processo: c.numero_processo,
          numero_mascara: c.numeroprocessocommascara,
          tribunal: c.siglaTribunal,
          orgao: c.nomeOrgao,
          tipo_comunicacao: c.tipoComunicacao,
          tipo_documento: c.tipoDocumento,
          classe: c.nomeClasse,
          meio: c.meiocompleto,
          data_disponibilizacao: c.data_disponibilizacao,
          texto,
          link: c.link,
          partes: (c.destinatarios ?? []).map((d) => ({ nome: d.nome, polo: d.polo })),
          advogados: (c.destinatarioadvogados ?? []).map((a) => ({
            nome: a.advogado?.nome ?? "",
            oab: a.advogado?.numero_oab ? `${a.advogado.numero_oab}/${a.advogado.uf_oab ?? ""}` : "",
          })),
          termo,
          uf: ufDaPublicacao(c.numero_processo, c.nomeOrgao),
          sugestoes_tipos: sugerir(texto, c.data_disponibilizacao).map((x) => x.tipo),
          process_id: p?.id ?? null,
          client_id: p?.client_id ?? null,
        };
      });
      const { data: inseridas, error } = await db
        .from("publicacoes")
        .upsert(linhas, { onConflict: "comunicacao_id", ignoreDuplicates: true })
        .select(CAMPOS_NOVA);
      if (error) throw new Error(`falha ao gravar: ${error.message}`);
      resultado.novas = inseridas?.length ?? 0;
      if (inseridas?.length && !cargaInicial) paraAvisar.push(...(inseridas as Nova[]));
    }
  } catch (e) {
    erros.push(`DJEN: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) INPI — revista semanal de marcas (só quando sai revista nova)
  try {
    const r = await executarINPI(db);
    resultado.inpiRevista = r.revista;
    resultado.inpiNovas = r.novas.length;
    if (!r.silencioso) paraAvisar.push(...r.novas);
  } catch (e) {
    erros.push(`INPI: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3) manutenção: liga ao processo, completa estado e sugestões das antigas
  try {
    await ligarPublicacoesAosProcessos(db);
    await completarUf(db);
    await completarSugestoes(db);
  } catch {}

  if (paraAvisar.length) {
    resultado.emailPara = await avisar(db, paraAvisar);
    // aviso no celular dos admins (independe do e-mail ter saído)
    const primeira = paraAvisar[0];
    await enviarPush(await idsDosAdmins(), {
      titulo: paraAvisar.length === 1 ? "📰 Publicação nova" : `📰 ${paraAvisar.length} publicações novas`,
      corpo:
        paraAvisar.length === 1
          ? `${primeira.tribunal ?? ""} · ${primeira.numero_mascara ?? primeira.numero_processo}${primeira.clients?.name ? ` · ${primeira.clients.name}` : ""}`
          : [...new Set(paraAvisar.map((n) => n.tribunal).filter(Boolean))].join(", "),
      url: paraAvisar.length === 1 ? `/admin/publicacoes?p=${primeira.id}` : "/admin/publicacoes",
    }).catch(() => 0);
  }
  resultado.erro = erros.join(" | ") || null;

  await db.from("monitor_execucoes").insert({
    origem,
    encontradas: resultado.encontradas,
    novas: resultado.novas + resultado.inpiNovas,
    erro: resultado.erro,
  });
  return resultado;
}

const MAX_REVISTAS_POR_VEZ = 2;

/** Lê as revistas do INPI que saíram desde a última lida. A primeira leitura não manda e-mail. */
async function executarINPI(db: Db): Promise<{ revista: number | null; novas: Nova[]; silencioso: boolean }> {
  const { data: cfg } = await db.from("monitor_config").select("inpi_procuradores, inpi_ultima_revista").eq("id", 1).maybeSingle();
  const nomes = (cfg?.inpi_procuradores ?? []).filter(Boolean);
  if (!nomes.length) return { revista: null, novas: [], silencioso: true };

  const ultima = await ultimaRevista();
  const lida = cfg?.inpi_ultima_revista ?? null;
  if (!ultima || (lida !== null && lida >= ultima)) return { revista: lida, novas: [], silencioso: true };

  const primeira = lida === null;
  const inicio = primeira ? ultima : Math.max(lida + 1, ultima - MAX_REVISTAS_POR_VEZ + 1);
  const novas: Nova[] = [];
  for (let numero = inicio; numero <= ultima; numero++) {
    const { data, processos } = await lerRevista(numero, nomes);
    if (processos.length) {
      const linhas = processos.map((p) => {
        const texto = textoDoProcesso(p, numero, data);
        const codigos = p.despachos.map((d) => d.codigo);
        return {
          comunicacao_id: idPublicacaoINPI(numero, p.numero),
          numero_processo: p.numero,
          numero_mascara: p.numero,
          tribunal: "INPI",
          orgao: `Revista da Propriedade Industrial nº ${numero}`,
          tipo_comunicacao: p.despachos.map((d) => d.nome).join(" · ") || "Despacho",
          tipo_documento: codigos.join(", "),
          classe: p.marca ? `Marca: ${p.marca}` : "Marca",
          meio: "Revista da Propriedade Industrial (INPI)",
          data_disponibilizacao: data,
          texto,
          link: "https://revistas.inpi.gov.br/rpi/",
          partes: p.titulares.map((t) => ({ nome: t.nome, polo: "Titular" })),
          advogados: [{ nome: p.procurador, oab: "" }],
          termo: "INPI",
          uf: p.titulares.find((t) => t.uf)?.uf ?? null,
          sugestoes_tipos: sugerir(texto, data, { tribunal: "INPI", codigos }).map((x) => x.tipo),
        };
      });
      const { data: inseridas, error } = await db
        .from("publicacoes")
        .upsert(linhas, { onConflict: "comunicacao_id", ignoreDuplicates: true })
        .select(CAMPOS_NOVA);
      if (error) throw new Error(`falha ao gravar a revista ${numero}: ${error.message}`);
      novas.push(...((inseridas ?? []) as Nova[]));
    }
    await db.from("monitor_config").update({ inpi_ultima_revista: numero }).eq("id", 1);
  }
  return { revista: ultima, novas, silencioso: primeira };
}

/** Preenche as sugestões oferecidas nas publicações antigas (para medir a % de uso). */
async function completarSugestoes(db: Db): Promise<void> {
  const { data } = await db
    .from("publicacoes")
    .select("id, texto, data_disponibilizacao, tribunal, tipo_documento")
    .filter("sugestoes_tipos", "eq", "{}")
    .gte("data_disponibilizacao", menosDias(hojeBahia(), 60))
    .limit(300);
  for (const p of data ?? []) {
    const codigos = p.tribunal === "INPI" ? (p.tipo_documento ?? "").split(/,\s*/) : undefined;
    const tipos = sugerir(p.texto ?? "", p.data_disponibilizacao, { tribunal: p.tribunal, codigos }).map((x) => x.tipo);
    if (tipos.length) await db.from("publicacoes").update({ sugestoes_tipos: tipos }).eq("id", p.id);
  }
}

type Nova = {
  id: string;
  numero_mascara: string | null;
  numero_processo: string;
  tribunal: string | null;
  orgao: string | null;
  tipo_comunicacao: string | null;
  data_disponibilizacao: string;
  texto: string | null;
  client_id: string | null;
  clients: { name: string } | null;
};

async function avisar(db: Db, novas: Nova[]): Promise<string | null> {
  const { data: cfg } = await db.from("monitor_config").select("email_alerta").eq("id", 1).maybeSingle();
  const para = cfg?.email_alerta?.trim();
  const resend = getResendClient();
  if (!para || !resend) return null;

  const ordenadas = [...novas].sort((a, b) => b.data_disponibilizacao.localeCompare(a.data_disponibilizacao));
  const cartoes = ordenadas
    .map((n) => {
      const trecho = (n.texto ?? "").replace(/\s+/g, " ").slice(0, 280);
      const cliente = n.clients?.name ?? "Processo não cadastrado no portal";
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #e4e7ec">
        <div style="font-size:12px;color:#5d6878">Divulgada ${dataBR(n.data_disponibilizacao)} · publicada ${dataBR(dataPublicacao(n.data_disponibilizacao))} · ${escapar(n.tribunal ?? "")} · ${escapar(n.tipo_comunicacao ?? "Publicação")}</div>
        <a href="${site()}/admin/publicacoes?p=${n.id}" style="color:#0f1a2a;font-weight:600;text-decoration:none;font-size:15px">Processo ${escapar(n.numero_mascara ?? n.numero_processo)}</a>
        <div style="font-size:13px;color:${n.client_id ? "#13325a" : "#b45309"};margin-top:2px">${escapar(cliente)}</div>
        <div style="font-size:12px;color:#5d6878;margin-top:4px">${escapar(n.orgao ?? "")}</div>
        <div style="font-size:13px;color:#344054;margin-top:6px">${escapar(trecho)}${(n.texto ?? "").length > 280 ? "…" : ""}</div>
      </td></tr>`;
    })
    .join("");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f1a2a">
    <div style="background:#0a1b31;border-radius:14px;padding:18px 22px;color:#fff">
      <div style="font-size:11px;letter-spacing:2px;color:#e1cd93;font-weight:bold">MC ADVOGADOS · PUBLICAÇÕES</div>
      <div style="font-size:18px;margin-top:6px">${novas.length} publicação${novas.length > 1 ? "ões" : ""} nova${novas.length > 1 ? "s" : ""} no Diário</div>
      <div style="font-size:12px;color:#a9b4c0;margin-top:2px">Diário de Justiça Eletrônico Nacional (DJEN)</div>
    </div>
    <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px">${cartoes}</table>
    <p style="margin-top:22px"><a href="${site()}/admin/publicacoes" style="background:#0b2545;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-size:13px">Tratar no portal</a></p>
    <p style="color:#98a2b3;font-size:11px;margin-top:22px">Aviso automático do portal MC Advogados. Busca feita a cada 2 horas (06h às 22h) pelas OABs cadastradas em Publicações → Monitoramento.</p>
  </div>`;

  const { error } = await resend.client.emails.send({
    from: resend.from,
    to: para,
    subject: `📰 ${novas.length} publicação${novas.length > 1 ? "ões" : ""} nova${novas.length > 1 ? "s" : ""} no Diário`,
    html,
  });
  if (error) return null;
  await db.from("publicacoes").update({ avisada_em: new Date().toISOString() }).in("id", novas.map((n) => n.id));
  return para;
}
