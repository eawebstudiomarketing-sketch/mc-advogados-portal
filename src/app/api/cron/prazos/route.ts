import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { limparAnexosAntigos } from "@/lib/assistente/limpeza";
import { lembrarAssinaturas } from "@/lib/atas/assinatura";
import { sincronizarTodasZapsign } from "@/lib/atas/zapsign";
import { enviarGerenteDoDia } from "@/lib/painel/gerente";
import { avisarFimDeContrato } from "@/lib/contrato-aviso";

import { cronAutorizado } from "@/lib/seguranca";
import { verificarSaude } from "@/lib/saude";
// Alertas de prazo (Vercel Cron, todo dia às 07h da Bahia — ver vercel.json).
// Para cada responsável, UM e-mail com as atividades dele que:
//   - vencem em 1 ou 2 dias ("chegando"),
//   - vencem hoje,
//   - acabaram de atrasar (avisa uma vez só).
// Cada aviso fica registrado em activity_deadline_alerts para não repetir;
// se o prazo mudar, a atividade volta a ser avisada no novo prazo.
// ?teste=1 → só mostra o que seria enviado (não envia nem registra).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Tipo = "antes" | "dia" | "atrasada";
type Item = { id: string; title: string; deadline: string; status: string; cliente: string; tipo: Tipo };

const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const dias = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
const site = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br").replace(/\/$/, "");

function tipoDo(deadline: string, hoje: string): Tipo | null {
  const d = dias(hoje, deadline);
  if (d === 0) return "dia";
  if (d === 1 || d === 2) return "antes";
  if (d < 0 && d >= -7) return "atrasada"; // atrasos antigos não geram aviso novo
  return null;
}

const TITULO: Record<Tipo, string> = { dia: "Vencem hoje", antes: "Vencem nos próximos 2 dias", atrasada: "Atrasaram" };
const COR: Record<Tipo, string> = { dia: "#b45309", antes: "#13325a", atrasada: "#c81e1e" };

function html(nome: string, itens: Item[], hoje: string): string {
  const blocos = (["atrasada", "dia", "antes"] as Tipo[])
    .map((t) => {
      const lista = itens.filter((i) => i.tipo === t);
      if (!lista.length) return "";
      const linhas = lista
        .map(
          (i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e4e7ec">
            <a href="${site()}/admin/activities/${i.id}" style="color:#0f1a2a;font-weight:600;text-decoration:none">${escapar(i.title)}</a>
            <div style="color:#5d6878;font-size:13px;margin-top:2px">${escapar(i.cliente)} · prazo ${dataBR(i.deadline)}</div>
          </td></tr>`
        )
        .join("");
      return `<h3 style="margin:22px 0 4px;font-size:14px;color:${COR[t]}">${TITULO[t]} (${lista.length})</h3><table width="100%" cellspacing="0" cellpadding="0">${linhas}</table>`;
    })
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f1a2a">
    <div style="background:#0a1b31;border-radius:14px;padding:18px 22px;color:#fff">
      <div style="font-size:11px;letter-spacing:2px;color:#e1cd93;font-weight:bold">MC ADVOGADOS · PORTAL</div>
      <div style="font-size:18px;margin-top:6px">Prazos das suas atividades</div>
      <div style="font-size:12px;color:#a9b4c0;margin-top:2px">${dataBR(hoje)}</div>
    </div>
    <p style="font-size:14px;margin:18px 2px 0">Olá, ${escapar(nome)}. Estas atividades sob sua responsabilidade precisam de atenção:</p>
    ${blocos}
    <p style="margin-top:24px"><a href="${site()}/admin/activities" style="background:#0b2545;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-size:13px">Abrir atividades no portal</a></p>
    <p style="color:#98a2b3;font-size:11px;margin-top:22px">Aviso automático do portal MC Advogados. Cada atividade é avisada uma vez por etapa (2 dias antes, no dia e ao atrasar).</p>
  </div>`;
}

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function GET(request: Request) {
  if (!cronAutorizado(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const teste = new URL(request.url).searchParams.get("teste") === "1";
  const db = createAdminClient();
  // manutenção diária: anexos do assistente não guardados há 7+ dias
  const anexosApagados = teste ? 0 : await limparAnexosAntigos().catch(() => 0);
  // atas aguardando assinatura: lembrete em 2 e 5 dias (aproveita o cron diário)
  if (!teste) await lembrarAssinaturas().catch((e) => console.error("lembretes de atas:", e instanceof Error ? e.message : e));
  // atas enviadas pela ZapSign: confere quem assinou e guarda o PDF quando todos assinarem
  if (!teste) await sincronizarTodasZapsign().catch((e) => console.error("atas ZapSign:", e instanceof Error ? e.message : e));
  // Painel do Dono: o "gerente" manda o resumo de ontem + o que fazer hoje no WhatsApp do Maurício
  // fim de contrato: aviso ao Maurício 30 dias antes e no último dia (portal + WhatsApp + Gmail)
  if (!teste) await avisarFimDeContrato().then((r) => console.log("fim de contrato:", r)).catch((e) => console.error("fim de contrato:", e instanceof Error ? e.message : e));
  if (!teste) await enviarGerenteDoDia().then((r) => console.log("painel gerente:", r)).catch((e) => console.error("painel gerente:", e instanceof Error ? e.message : e));
  // saúde do sistema: uso do banco (alerta antes do limite) e limpeza das cópias de excluídos
  if (!teste) await verificarSaude().then((r) => console.log("saúde:", r.join(" | "))).catch((e) => console.error("saúde:", e instanceof Error ? e.message : e));
  const hoje = hojeBahia();

  const { data: atividades, error } = await db
    .from("activities")
    .select("id, title, deadline, status, responsible_id, clients(name), responsaveis(nome, email)")
    .in("status", ["aberta", "em_andamento"])
    .is("archived_at", null)
    .not("deadline", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const candidatos = (atividades ?? [])
    .map((a) => ({ ...a, tipo: tipoDo(a.deadline!, hoje) }))
    .filter((a): a is typeof a & { tipo: Tipo } => a.tipo !== null);
  if (!candidatos.length) return NextResponse.json({ ok: true, hoje, enviados: 0, anexosApagados, nota: "Nenhum prazo para avisar hoje." });

  // já avisados (mesma atividade, mesmo tipo, mesmo prazo)
  const { data: ja } = await db
    .from("activity_deadline_alerts")
    .select("activity_id, tipo, deadline")
    .in("activity_id", candidatos.map((c) => c.id));
  const avisado = new Set((ja ?? []).map((j) => `${j.activity_id}|${j.tipo}|${j.deadline}`));
  const novos = candidatos.filter((c) => !avisado.has(`${c.id}|${c.tipo}|${c.deadline}`));
  if (!novos.length) return NextResponse.json({ ok: true, hoje, enviados: 0, anexosApagados, nota: "Tudo já tinha sido avisado." });

  // Destino: o Gmail do responsável (com ou sem login). Atividade antiga sem
  // responsável cai no perfil de quem a criou.
  const semResponsavel = novos.filter((n) => !n.responsaveis?.email).map((n) => n.responsible_id);
  const { data: pessoas } = semResponsavel.length
    ? await db.from("profiles").select("id, full_name, email").in("id", [...new Set(semResponsavel)])
    : { data: [] as { id: string; full_name: string; email: string }[] };
  const porPessoa = new Map<string, { nome: string; email: string; itens: Item[] }>();
  for (const n of novos) {
    const p = pessoas?.find((x) => x.id === n.responsible_id);
    const dest = n.responsaveis?.email ? { nome: n.responsaveis.nome, email: n.responsaveis.email } : p?.email ? { nome: p.full_name, email: p.email } : null;
    if (!dest) continue;
    const chave = dest.email.toLowerCase();
    const g = porPessoa.get(chave) ?? { nome: dest.nome.split(" ")[0], email: dest.email, itens: [] };
    g.itens.push({ id: n.id, title: n.title, deadline: n.deadline!, status: n.status, cliente: n.clients?.name ?? "Sem cliente", tipo: n.tipo });
    porPessoa.set(chave, g);
  }

  if (teste) {
    return NextResponse.json({
      ok: true,
      teste: true,
      hoje,
      emails: [...porPessoa.values()].map((g) => ({ para: g.email, itens: g.itens.map((i) => `${i.tipo}: ${i.title} (${i.deadline})`) })),
    });
  }

  const resend = getResendClient();
  if (!resend) return NextResponse.json({ ok: false, nota: "E-mail não configurado (RESEND_API_KEY/RESEND_FROM_EMAIL)." }, { status: 500 });

  let enviados = 0;
  const falhas: string[] = [];
  for (const g of porPessoa.values()) {
    const urgentes = g.itens.filter((i) => i.tipo !== "antes").length;
    const assunto = urgentes
      ? `⚠️ ${urgentes} atividade(s) vencendo hoje ou atrasada(s)`
      : `Prazos chegando: ${g.itens.length} atividade(s) nos próximos 2 dias`;
    const { error: erroEnvio } = await resend.client.emails.send({ from: resend.from, to: g.email, subject: assunto, html: html(g.nome, g.itens, hoje) });
    if (erroEnvio) {
      falhas.push(g.email);
      continue;
    }
    enviados++;
    await db
      .from("activity_deadline_alerts")
      .upsert(
        g.itens.map((i) => ({ activity_id: i.id, tipo: i.tipo, deadline: i.deadline, sent_to: g.email })),
        { onConflict: "activity_id,tipo,deadline", ignoreDuplicates: true }
      );
  }
  return NextResponse.json({ ok: falhas.length === 0, hoje, enviados, falhas, anexosApagados });
}
