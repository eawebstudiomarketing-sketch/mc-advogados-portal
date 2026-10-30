import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enfileirarMensagem } from "@/lib/zap/fila";

// Parabéns no WhatsApp (item 14 da auditoria, 30/10/2026). Manual pela aba
// Contatos → Aniversários, ou automático às 09h (cron /api/cron/aniversarios)
// quando o admin liga. Só conversa individual (nunca grupo) e uma vez por ano:
// a fila guarda origem_ref = aniversario:<cliente>:<ano>.

export const MENSAGEM_PADRAO =
  "Olá, {cliente}! Hoje é seu dia e toda a equipe da MC Advogados deseja um feliz aniversário, com muita saúde e conquistas. Conte sempre com a gente!";

export type ConfigAniversario = { ativo: boolean; mensagem: string; migrationAplicada: boolean };

/** Configuração do parabéns; sem a migration 0058 aplicada, volta desligado. */
export async function getConfigAniversario(): Promise<ConfigAniversario> {
  const { data, error } = await createAdminClient().from("escritorio_config").select("aniversario_ativo, aniversario_mensagem").eq("id", 1).maybeSingle();
  if (error || !data) return { ativo: false, mensagem: MENSAGEM_PADRAO, migrationAplicada: !error };
  return { ativo: !!data.aniversario_ativo, mensagem: data.aniversario_mensagem || MENSAGEM_PADRAO, migrationAplicada: true };
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;
export const preencherParabens = (modelo: string, nome: string) => modelo.replaceAll("{cliente}", primeiroNome(nome));
export const refParabens = (clientId: string, ano: number) => `aniversario:${clientId}:${ano}`;

/** Conversa individual do cliente (contato do WhatsApp ou número da ficha); grupo não serve para parabéns. */
export async function destinoParabens(clientId: string): Promise<{ para: string; rotulo: string } | null> {
  const db = createAdminClient();
  const [{ data: cliente }, { data: chats }] = await Promise.all([
    db.from("clients").select("whatsapp_numeros, telefones").eq("id", clientId).maybeSingle(),
    db.from("wa_chats").select("chat_jid, nome, is_group").eq("client_id", clientId).eq("is_group", false).order("ultima_msg_em", { ascending: false, nullsFirst: false }),
  ]);
  const contato = (chats ?? []).find((c) => c.chat_jid.endsWith("@s.whatsapp.net"));
  if (contato) return { para: contato.chat_jid, rotulo: `contato ${contato.nome ?? contato.chat_jid.split("@")[0]}` };
  const numero = cliente?.whatsapp_numeros?.[0] ?? cliente?.telefones?.find((t) => t.replace(/\D/g, "").length >= 10);
  if (numero) return { para: numero.replace(/\D/g, ""), rotulo: `número ${numero}` };
  return null;
}

/** Já saiu (ou está na fila) o parabéns deste ano? */
export async function parabensJaEnviados(clientIds: string[], ano: number): Promise<Set<string>> {
  if (!clientIds.length) return new Set();
  const { data } = await createAdminClient()
    .from("wa_jobs")
    .select("origem_ref")
    .in(
      "origem_ref",
      clientIds.map((id) => refParabens(id, ano))
    );
  return new Set((data ?? []).map((j) => j.origem_ref!.split(":")[1]));
}

export async function enfileirarParabens(c: { id: string; name: string }, texto: string, ano: number, criadoPor: string | null): Promise<{ ok: true; rotulo: string } | { ok: false; error: string }> {
  if ((await parabensJaEnviados([c.id], ano)).has(c.id)) return { ok: false, error: "O parabéns deste ano já foi enviado para este cliente." };
  const destino = await destinoParabens(c.id);
  if (!destino) return { ok: false, error: "Este cliente não tem WhatsApp individual vinculado (número ou contato)." };
  const job = await enfileirarMensagem({
    para: destino.para,
    texto,
    origemRef: refParabens(c.id, ano),
    expiraEm: new Date(Date.now() + 12 * 3_600_000),
    criadoPor,
  });
  return job ? { ok: true, rotulo: destino.rotulo } : { ok: false, error: "Não foi possível colocar a mensagem na fila do WhatsApp." };
}

const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());

/** Cron das 09h: parabéns para quem faz aniversário hoje (se o admin ligou). */
export async function enfileirarAniversariosDoDia(): Promise<{ ativo: boolean; enviados: number; semZap: number; jaEnviados: number }> {
  const config = await getConfigAniversario();
  if (!config.ativo) return { ativo: false, enviados: 0, semZap: 0, jaEnviados: 0 };
  const hoje = hojeBahia();
  const ano = Number(hoje.slice(0, 4));
  const mmdd = hoje.slice(5);
  const { data } = await createAdminClient()
    .from("clients")
    .select("id, name, nascimento")
    .is("archived_at", null)
    .eq("active", true)
    .eq("falecido", false)
    .not("nascimento", "is", null);
  // 29/02 comemora no 28/02 nos anos que não são bissextos
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const doDia = (data ?? []).filter((c) => {
    const d = c.nascimento!.slice(5, 10);
    return d === mmdd || (!bissexto && d === "02-29" && mmdd === "02-28");
  });
  const ja = await parabensJaEnviados(
    doDia.map((c) => c.id),
    ano
  );
  let enviados = 0;
  let semZap = 0;
  for (const c of doDia) {
    if (ja.has(c.id)) continue;
    const r = await enfileirarParabens(c, preencherParabens(config.mensagem, c.name), ano, null);
    if (r.ok) enviados++;
    else semZap++;
  }
  return { ativo: true, enviados, semZap, jaEnviados: ja.size };
}
