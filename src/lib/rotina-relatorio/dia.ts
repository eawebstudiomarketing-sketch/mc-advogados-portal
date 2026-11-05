import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPessoas } from "@/lib/data/escritorio";
import { rotinaDoDia } from "@/lib/data/rotina-diaria";
import { ehDiaDeExpediente } from "@/lib/publicacoes/sugestoes";
import { criarOrdem } from "@/lib/whatsapp";
import { demandasVencidas, modelosAtribuidos, relatoriosDoDia } from "./dados";
import { chaveResposta, enviadoComAtraso, SECAO_ROTULO, SECOES, type DemandaVencida, type RelatorioDoDia, type Valor } from "./tipos";

// Fim do dia (Rotinas v2): monta o HTML com tudo sobre as rotinas e as demandas
// do dia e manda no WhatsApp do Maurício, com um resumo curto. Roda à 00:05
// (Bahia) para o dia que acabou de fechar; uma vez só por dia (rotina_relatorio_dia).

const db = () => createAdminClient() as unknown as SupabaseClient;
export const MAURICIO = "ee479af5-6a30-4741-880a-c9e96ea0079b"; // profile do Maurício (igual a lib/saude.ts)
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const dataBr = (dia: string) => dia.split("-").reverse().join("/");
const hora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const somaUmDia = (dia: string) => new Date(Date.parse(`${dia}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const valorTexto = (v: Valor | undefined) => (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length) ? "—" : Array.isArray(v) ? v.join(", ") : String(v));

type Concluida = { titulo: string; cliente: string | null };
type PessoaDia = {
  id: string;
  nome: string;
  relatorio: RelatorioDoDia | null;
  temModelo: boolean;
  /** relatório da equipe enviado depois das 18:00 */
  atrasado: boolean;
  fixas: { titulo: string; feito: boolean }[];
  concluidas: Concluida[];
  vencidas: DemandaVencida[];
};

export async function concluidasNoDia(responsavelId: string, dia: string): Promise<Concluida[]> {
  const { data } = await db()
    .from("activities")
    .select("title, clients(name)")
    .eq("responsavel_id", responsavelId)
    .eq("status", "concluida")
    .gte("concluida_em", `${dia}T00:00:00-03:00`)
    .lt("concluida_em", `${somaUmDia(dia)}T00:00:00-03:00`);
  return (data ?? []).map((a) => ({ titulo: a.title as string, cliente: (a.clients as unknown as { name: string } | null)?.name ?? null }));
}

export async function coletarDia(dia: string): Promise<PessoaDia[]> {
  const [pessoas, relatorios, atribuidos] = await Promise.all([listPessoas(), relatoriosDoDia(dia), modelosAtribuidos()]);
  const porPessoa = new Map(relatorios.map((r) => [r.responsavel_id, r]));
  const equipe = pessoas.filter((p) => p.profileId);
  return Promise.all(
    equipe.map(async (p) => {
      const rel = porPessoa.get(p.id) ?? null;
      const [fixas, concluidas, vencidas] = await Promise.all([
        rotinaDoDia(p.id, dia, db()),
        concluidasNoDia(p.id, dia),
        rel?.status === "enviado" && rel.snapshot ? Promise.resolve(rel.snapshot.demandas) : demandasVencidas(p.id, dia),
      ]);
      return {
        id: p.id,
        nome: p.nome,
        relatorio: rel,
        temModelo: atribuidos.has(p.id),
        atrasado: rel?.status === "enviado" && p.profileId !== MAURICIO && enviadoComAtraso(rel.enviado_em),
        fixas: fixas.map((f) => ({ titulo: f.titulo, feito: f.feito })),
        concluidas,
        vencidas,
      };
    })
  );
}

function blocoRelatorio(r: RelatorioDoDia): string {
  const snap = r.snapshot;
  if (!snap) return "";
  const partes: string[] = [];
  for (const s of SECOES) {
    const perguntas = snap.perguntas.filter((p) => p.secao === s);
    if (!perguntas.length) continue;
    if (s === "equipe_pessoa" && snap.equipe.length === 0) continue;
    let corpo = "";
    if (s === "equipe_pessoa") {
      corpo = snap.equipe
        .map(
          (pessoa) =>
            `<div class="sub"><strong>${esc(pessoa.nome)}</strong>${perguntas
              .map((p) => `<p class="q">${esc(p.texto)}</p><p class="a">${esc(valorTexto(r.respostas[chaveResposta(p.id, pessoa.id)]))}</p>`)
              .join("")}</div>`
        )
        .join("");
    } else {
      corpo = perguntas.map((p) => `<p class="q">${esc(p.texto)}</p><p class="a">${esc(valorTexto(r.respostas[chaveResposta(p.id)]))}</p>`).join("");
    }
    partes.push(`<h4>${esc(SECAO_ROTULO[s].titulo)}</h4>${corpo}`);
  }
  return partes.join("");
}

export function montarHtml(dia: string, pessoas: PessoaDia[]): string {
  const comRelatorio = pessoas.filter((p) => p.temModelo);
  const enviados = comRelatorio.filter((p) => p.relatorio?.status === "enviado").length;
  const secoes = pessoas
    .map((p) => {
      const fixasFeitas = p.fixas.filter((f) => f.feito).length;
      const status = !p.temModelo
        ? `<span class="tag neutro">sem relatório</span>`
        : p.relatorio?.status === "enviado"
          ? `<span class="tag ${p.atrasado ? "ruim" : "ok"}">relatório enviado às ${esc(hora(p.relatorio.enviado_em!))}${p.atrasado ? " (com atraso)" : ""}</span>`
          : `<span class="tag ruim">relatório não enviado</span>`;
      return `<section>
  <h3>${esc(p.nome)} ${status}</h3>
  ${
    p.fixas.length
      ? `<h4>Rotina fixa (${fixasFeitas}/${p.fixas.length})</h4><ul>${p.fixas.map((f) => `<li>${f.feito ? "✅" : "❌"} ${esc(f.titulo)}</li>`).join("")}</ul>`
      : ""
  }
  <h4>Demandas concluídas no dia (${p.concluidas.length})</h4>
  ${p.concluidas.length ? `<ul>${p.concluidas.map((c) => `<li>${esc(c.titulo)} <span class="mut">· ${esc(c.cliente ?? "Sem cliente")}</span></li>`).join("")}</ul>` : `<p class="mut">Nenhuma.</p>`}
  <h4>Demandas vencidas em aberto (${p.vencidas.length})</h4>
  ${
    p.vencidas.length
      ? `<ul>${p.vencidas
          .map(
            (d) =>
              `<li>${esc(d.titulo)} <span class="mut">· ${esc(d.cliente ?? "Sem cliente")} · ${d.diasAtraso > 0 ? `${d.diasAtraso} d de atraso` : "vence hoje"}</span><p class="a">${esc(p.relatorio?.justificativas[d.id] ?? "Sem justificativa.")}</p></li>`
          )
          .join("")}</ul>`
      : `<p class="mut">Nenhuma.</p>`
  }
  ${p.relatorio?.status === "enviado" ? blocoRelatorio(p.relatorio) : ""}
</section>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rotinas de ${esc(dataBr(dia))}</title>
<style>
body{font:15px/1.55 system-ui,Segoe UI,sans-serif;background:#f6f7fa;color:#18202c;margin:0;padding:24px 16px}
.wrap{max-width:820px;margin:0 auto}
h1{font-size:24px;margin:0 0 4px} .res{color:#4a5566;margin:0 0 22px}
section{background:#fff;border:1px solid #dde2ea;border-radius:12px;padding:16px 18px;margin:0 0 16px}
h3{font-size:18px;margin:0 0 6px} h4{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7a8596;margin:14px 0 4px}
ul{margin:0;padding-left:20px} li{margin:3px 0} .mut{color:#7a8596;font-size:13px}
.q{margin:8px 0 0;color:#4a5566;font-size:13px} .a{margin:2px 0 0;white-space:pre-wrap}
.sub{border-left:3px solid #dde2ea;padding:2px 0 2px 10px;margin:8px 0}
.tag{font-size:12px;font-weight:600;border-radius:999px;padding:2px 9px;margin-left:6px;vertical-align:middle}
.ok{background:#e1f3e9;color:#2f8a5b}.ruim{background:#fbe3e3;color:#c0393b}.neutro{background:#eef1f6;color:#7a8596}
footer{color:#7a8596;font-size:12px;margin-top:18px}
@media (prefers-color-scheme:dark){body{background:#11151c;color:#e8edf4}section{background:#181e27;border-color:#2d3746}.res,.q{color:#b2bccb}}
</style></head><body><div class="wrap">
<h1>Rotinas e demandas de ${esc(dataBr(dia))}</h1>
<p class="res">${enviados} de ${comRelatorio.length} relatórios enviados · ${pessoas.reduce((n, p) => n + p.concluidas.length, 0)} demandas concluídas · ${pessoas.reduce((n, p) => n + p.vencidas.length, 0)} vencidas em aberto.</p>
${secoes}
<footer>Gerado automaticamente pelo portal MC Advogados · ${esc(SITE)}</footer>
</div></body></html>`;
}

export type ResultadoEnvioDia = { dia: string; enviado: boolean; motivo?: string };

/** Gera o HTML do dia e manda para o WhatsApp do Maurício. Uma vez por dia, a menos que `forcar`. */
export async function enviarRelatorioDoDia(dia: string, { forcar = false }: { forcar?: boolean } = {}): Promise<ResultadoEnvioDia> {
  if (!forcar && !ehDiaDeExpediente(dia)) return { dia, enviado: false, motivo: "não é dia de expediente" };
  if (!forcar) {
    const { data: jaFoi } = await db().from("rotina_relatorio_dia").select("dia").eq("dia", dia).maybeSingle();
    if (jaFoi) return { dia, enviado: false, motivo: "já enviado" };
  }
  const { data: resp } = await db().from("responsaveis").select("telefone").eq("profile_id", MAURICIO).maybeSingle();
  const telefone = String(resp?.telefone ?? "").replace(/\D/g, "");
  if (telefone.length < 10) return { dia, enviado: false, motivo: "o Maurício não tem WhatsApp cadastrado" };

  const pessoas = await coletarDia(dia);
  const html = montarHtml(dia, pessoas);
  const caminho = `rotina-relatorios/${dia}.html`;
  const { error: up } = await db().storage.from("documents").upload(caminho, new Blob([html], { type: "text/html;charset=utf-8" }), { upsert: true, contentType: "text/html;charset=utf-8" });
  if (up) return { dia, enviado: false, motivo: `não consegui guardar o arquivo: ${up.message}` };

  const comModelo = pessoas.filter((p) => p.temModelo);
  const pendentes = comModelo.filter((p) => p.relatorio?.status !== "enviado").map((p) => p.nome.replace(/^(Dr\.?|Dra\.?)\s+/i, "").split(" ")[0]);
  const concluidas = pessoas.reduce((n, p) => n + p.concluidas.length, 0);
  const vencidas = pessoas.reduce((n, p) => n + p.vencidas.length, 0);
  const texto =
    `*Rotinas de ${dataBr(dia)}*\n\n` +
    `Relatórios enviados: ${comModelo.length - pendentes.length} de ${comModelo.length}\n` +
    (pendentes.length ? `Não enviaram: ${pendentes.join(", ")}\n` : "") +
    `Demandas concluídas no dia: ${concluidas}\nDemandas vencidas em aberto: ${vencidas}\n\n` +
    `O arquivo em anexo tem tudo (abra no navegador).`;
  const job = await criarOrdem(db() as never, {
    tipo: "enviar_arquivo",
    payload: { para: telefone, texto, quem: "ia", bucket: "documents", media_path: caminho, mime: "text/html", nome: `Rotinas ${dia.split("-").reverse().join("-")}.html` },
  });
  await db().from("rotina_relatorio_dia").upsert({ dia, job_id: job.id, enviado_em: new Date().toISOString() });
  return { dia, enviado: true };
}
