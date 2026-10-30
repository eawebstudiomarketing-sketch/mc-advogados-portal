import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient } from "@/lib/email/resend";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { preferenciaDe } from "@/lib/notificacoes";
import { criarAvisos } from "@/lib/avisos";
import { diasParaFim, fimDoContrato } from "./contrato";

// Aviso de fim de contrato (27/10/2026), rodado todo dia no cron das 7h:
//  • 30 dias antes: portal (sininho) + WhatsApp + Gmail do Maurício;
//  • no último dia: portal + WhatsApp do Maurício.
// Por enquanto só o Maurício recebe (decisão do usuário; depois define o resto).
// Cada aviso vale por (cliente, data do fim, tipo) — se a data muda, avisa de novo.

const db = () => createAdminClient() as unknown as SupabaseClient;
const MAURICIO = "ee479af5-6a30-4741-880a-c9e96ea0079b"; // perfil do Maurício (admin máximo)
const br = (d: string) => d.split("-").reverse().join("/");

export async function avisarFimDeContrato(): Promise<string> {
  const { data: fichas } = await db().from("client_handoffs").select("client_id, handoff, clients(name)");
  type Ficha = { client_id: string; handoff: Record<string, unknown> | null; clients: { name: string } | null };
  const alvos = ((fichas ?? []) as unknown as Ficha[])
    .map((f) => ({ clientId: f.client_id, nome: f.clients?.name ?? "Cliente", fim: fimDoContrato(f.handoff) }))
    .filter((f): f is { clientId: string; nome: string; fim: string } => !!f.fim)
    .map((f) => ({ ...f, dias: diasParaFim(f.fim) }))
    .filter((f) => f.dias >= 0 && f.dias <= 30);
  if (!alvos.length) return "nenhum contrato perto do fim";

  const { data: ja } = await db().from("contrato_avisos").select("client_id, fim, tipo").in("client_id", alvos.map((a) => a.clientId));
  const enviado = new Set(((ja ?? []) as { client_id: string; fim: string; tipo: string }[]).map((x) => `${x.client_id}|${x.fim}|${x.tipo}`));

  const [{ data: resp }, { data: perfil }] = await Promise.all([
    db().from("responsaveis").select("telefone").eq("profile_id", MAURICIO).maybeSingle(),
    db().from("profiles").select("email").eq("id", MAURICIO).maybeSingle(),
  ]);
  const telefone = String(resp?.telefone ?? "").replace(/\D/g, "");
  const email = (perfil?.email as string | null) ?? null;
  const resend = getResendClient();
  const [prefZap, prefEmail] = await Promise.all([preferenciaDe(MAURICIO, "contratos", "zap"), preferenciaDe(MAURICIO, "contratos", "email")]);
  const feitos: string[] = [];

  for (const a of alvos) {
    // 30 dias antes (vale também para contrato cadastrado já dentro dos 30 dias)
    if (!enviado.has(`${a.clientId}|${a.fim}|d30`) && a.dias > 0) {
      const texto = `*Contrato perto do fim*\n${a.nome}: o contrato termina em ${br(a.fim)} (faltam ${a.dias} ${a.dias === 1 ? "dia" : "dias"}).\nVale conversar sobre a renovação.\nmcadvogados.app.br/admin/clients/${a.clientId}`;
      await criarAvisos([{ profile_id: MAURICIO, tipo: "contrato", titulo: `Contrato de ${a.nome} termina em ${a.dias} dias`, corpo: `Fim do contrato: ${br(a.fim)}`, url: `/admin/clients/${a.clientId}` }]).catch(() => undefined);
      if (prefZap.ativo && telefone.length >= 10) await enfileirarMensagem({ para: telefone, texto, origemRef: `contrato:${a.clientId}:${a.fim}:d30`, expiraEm: new Date(Date.now() + 24 * 3_600_000) });
      if (prefEmail.ativo && resend && email)
        await resend.client.emails
          .send({
            from: resend.from,
            to: email,
            subject: `Contrato de ${a.nome} termina em ${br(a.fim)}`,
            html: `<p>Olá, Maurício.</p><p>O contrato de <b>${a.nome}</b> termina em <b>${br(a.fim)}</b> (faltam ${a.dias} dias).</p><p>Vale conversar sobre a renovação. <a href="https://mcadvogados.app.br/admin/clients/${a.clientId}">Abrir o cliente no portal</a></p>`,
          })
          .catch((e) => console.error("contrato e-mail:", e instanceof Error ? e.message : e));
      await db().from("contrato_avisos").upsert({ client_id: a.clientId, fim: a.fim, tipo: "d30" });
      feitos.push(`${a.nome} (30 dias)`);
    }
    // último dia
    if (a.dias === 0 && !enviado.has(`${a.clientId}|${a.fim}|d0`)) {
      const texto = `*Hoje é o último dia do contrato*\n${a.nome}: o contrato termina hoje (${br(a.fim)}).\nmcadvogados.app.br/admin/clients/${a.clientId}`;
      await criarAvisos([{ profile_id: MAURICIO, tipo: "contrato", titulo: `Hoje termina o contrato de ${a.nome}`, corpo: `Fim do contrato: ${br(a.fim)}`, url: `/admin/clients/${a.clientId}` }]).catch(() => undefined);
      if (prefZap.ativo && telefone.length >= 10) await enfileirarMensagem({ para: telefone, texto, origemRef: `contrato:${a.clientId}:${a.fim}:d0`, expiraEm: new Date(Date.now() + 18 * 3_600_000) });
      await db().from("contrato_avisos").upsert({ client_id: a.clientId, fim: a.fim, tipo: "d0" });
      feitos.push(`${a.nome} (último dia)`);
    }
  }
  return feitos.length ? `avisou: ${feitos.join(", ")}` : "tudo já avisado";
}
