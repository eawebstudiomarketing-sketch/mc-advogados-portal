import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { buscarPorOab, textoLimpo, type ComunicacaoDJEN } from "./djen";
import { ufDaPublicacao } from "./uf";
import { dataPublicacao } from "./sugestoes";

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

export type ResultadoMonitor = { encontradas: number; novas: number; emailPara: string | null; erro: string | null };

export async function executarMonitor(origem: "cron" | "manual"): Promise<ResultadoMonitor> {
  const db = createAdminClient();
  const fim = hojeBahia();
  const { count: jaTem } = await db.from("publicacoes").select("id", { count: "exact", head: true });
  const cargaInicial = !jaTem;
  const inicio = menosDias(fim, cargaInicial ? JANELA_CARGA_INICIAL : JANELA_DIAS);
  const resultado: ResultadoMonitor = { encontradas: 0, novas: 0, emailPara: null, erro: null };

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
          texto: textoLimpo(c.texto),
          link: c.link,
          partes: (c.destinatarios ?? []).map((d) => ({ nome: d.nome, polo: d.polo })),
          advogados: (c.destinatarioadvogados ?? []).map((a) => ({
            nome: a.advogado?.nome ?? "",
            oab: a.advogado?.numero_oab ? `${a.advogado.numero_oab}/${a.advogado.uf_oab ?? ""}` : "",
          })),
          termo,
          uf: ufDaPublicacao(c.numero_processo, c.nomeOrgao),
          process_id: p?.id ?? null,
          client_id: p?.client_id ?? null,
        };
      });
      const { data: inseridas, error } = await db
        .from("publicacoes")
        .upsert(linhas, { onConflict: "comunicacao_id", ignoreDuplicates: true })
        .select("id, numero_mascara, numero_processo, tribunal, orgao, tipo_comunicacao, data_disponibilizacao, texto, client_id, clients(name)");
      if (error) throw new Error(`Falha ao gravar publicações: ${error.message}`);
      resultado.novas = inseridas?.length ?? 0;

      if (inseridas?.length && !cargaInicial) resultado.emailPara = await avisar(db, inseridas);
    }
    await ligarPublicacoesAosProcessos(db);
    await completarUf(db);
  } catch (e) {
    resultado.erro = e instanceof Error ? e.message : String(e);
  }

  await db.from("monitor_execucoes").insert({
    origem,
    encontradas: resultado.encontradas,
    novas: resultado.novas,
    erro: resultado.erro,
  });
  return resultado;
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
