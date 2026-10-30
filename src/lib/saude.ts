import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { preferenciaDe } from "@/lib/notificacoes";
import { getResendClient } from "@/lib/email/resend";

// Saúde do sistema (28/10/2026), chamada pelo cron diário de prazos:
//  - uso do banco: avisa o Maurício (WhatsApp) e o e-mail de alertas do ARCH quando
//    passar de 75% do limite do plano (o grátis do Supabase é 500 MB; o banco já
//    travou por isso em abril/2026);
//  - limpa as cópias de registros excluídos com mais de 180 dias.

const db = () => createAdminClient() as unknown as SupabaseClient;
const MAURICIO = "ee479af5-6a30-4741-880a-c9e96ea0079b";
const EMAIL_ALERTAS = "eawebstudiomarketing@gmail.com";
const LIMITE_MB = Number(process.env.DB_LIMITE_MB) || 500;
const mb = (b: number) => `${(b / 1_048_576).toFixed(0)} MB`;

async function avisar(titulo: string, corpo: string) {
  const { data: resp } = await db().from("responsaveis").select("telefone").eq("profile_id", MAURICIO).maybeSingle();
  const tel = String(resp?.telefone ?? "").replace(/\D/g, "");
  const [prefZap, prefEmail] = await Promise.all([preferenciaDe(MAURICIO, "alertas_sistema", "zap"), preferenciaDe(MAURICIO, "alertas_sistema", "email")]);
  if (prefZap.ativo && tel.length >= 10) await enfileirarMensagem({ para: tel, texto: `*${titulo}*\n\n${corpo}`, origemRef: `saude:${titulo}`, expiraEm: new Date(Date.now() + 24 * 3_600_000) }).catch(() => undefined);
  const r = getResendClient();
  if (prefEmail.ativo && r) await r.client.emails.send({ from: r.from, to: EMAIL_ALERTAS, subject: titulo, text: corpo }).catch(() => undefined);
}

export async function verificarSaude(): Promise<string[]> {
  const out: string[] = [];
  const { data: uso, error } = await db().rpc("uso_do_banco");
  if (error || !uso) {
    out.push(`uso do banco: indisponível (${error?.message ?? "sem resposta"})`);
  } else {
    const { bytes, maiores } = uso as { bytes: number; maiores: { tabela: string; bytes: number }[] };
    const pct = Math.round((bytes / (LIMITE_MB * 1_048_576)) * 100);
    out.push(`banco: ${mb(bytes)} de ${LIMITE_MB} MB (${pct}%)`);
    if (pct >= 75) {
      const nivel = pct >= 90 ? "critico" : "alto";
      // no máximo um aviso a cada 3 dias por nível
      const chave = `saude-banco|${nivel}`;
      const { data: ult } = await db().from("painel_gerente").select("created_at").eq("chave", chave).maybeSingle();
      if (!ult || Date.now() - Date.parse(ult.created_at as string) > 3 * 86_400_000) {
        await avisar(
          `${pct >= 90 ? "🔴" : "🟠"} Banco do portal em ${pct}% do limite`,
          `O banco está com ${mb(bytes)} de ${LIMITE_MB} MB. Ao bater o limite o portal pode parar de gravar (já aconteceu em abril).\nMaiores tabelas: ${(maiores ?? []).map((m) => `${m.tabela} (${mb(m.bytes)})`).join(", ")}.\nSugestão: limpar o que for antigo ou subir de plano.`
        );
        await db().from("painel_gerente").upsert({ chave, conteudo: { pct, bytes }, created_at: new Date().toISOString() });
        out.push(`aviso enviado (${nivel})`);
      }
    }
  }
  const { data: limpos } = await db().rpc("limpar_excluidos_antigos");
  if (typeof limpos === "number" && limpos > 0) out.push(`cópias de excluídos antigas removidas: ${limpos}`);
  return out;
}
