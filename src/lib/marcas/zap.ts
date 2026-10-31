import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { enfileirarMensagem } from "@/lib/zap/fila";
import { statusDaMensagem, type ConfigEnvio, type MarcaZap, type Modelo } from "./mensagem";

export { modeloPara, montarMensagem, statusDaMensagem, type ConfigEnvio, type MarcaZap, type Modelo } from "./mensagem";

// Aba WhatsApp das Marcas (30/10/2026): um modelo de mensagem por status,
// com as variáveis preenchidas sozinhas; manda pela fila do Agente MC.
// Variáveis: {cliente} {marca} {processo} {status} {data} {despacho}
// {data_despacho} {classe} {proxima_etapa}.

const db = () => createAdminClient() as unknown as SupabaseClient;

export async function listModelos(): Promise<Modelo[]> {
  const { data } = await db().from("marca_modelos").select("*").order("ordem").order("status");
  return data ?? [];
}

export async function getConfigEnvio(): Promise<ConfigEnvio> {
  const { data } = await db().from("marca_config").select("envio_modo, envio_dia, ultimo_envio_auto").eq("id", 1).maybeSingle();
  return data ?? { envio_modo: "manual", envio_dia: 5, ultimo_envio_auto: null };
}

/** Carteira com o que a aba WhatsApp mostra (próximo prazo e último envio). */
export async function listMarcasZap(): Promise<MarcaZap[]> {
  const banco = db();
  const [{ data: marcas }, { data: prazos }, { data: envios }] = await Promise.all([
    banco
      .from("marcas")
      .select("id, processo, nome, apelido, classe, situacao, status_mensagem, ultimo_despacho, ultimo_despacho_data, previsao, contato_nome, contato_numero, client_id, avisar_cliente, clients(name)")
      .eq("acompanhando", true)
      .eq("tipo", "marca")
      .order("nome"),
    banco.from("marca_prazos").select("marca_id, vence_em").eq("situacao", "pendente").order("vence_em"),
    banco.from("marca_envios").select("marca_id, created_at").order("created_at", { ascending: false }).limit(2000),
  ]);
  const prazo = new Map<string, string>();
  for (const p of prazos ?? []) if (!prazo.has(p.marca_id)) prazo.set(p.marca_id, p.vence_em);
  const envio = new Map<string, string>();
  for (const e of envios ?? []) if (!envio.has(e.marca_id)) envio.set(e.marca_id, e.created_at);
  return ((marcas ?? []) as unknown as MarcaZap[]).map((m) => ({ ...m, proximo_prazo: prazo.get(m.id) ?? null, ultimo_envio: envio.get(m.id) ?? null }));
}

/** Manda a mensagem de uma marca (texto pronto) e registra o envio. */
export async function enviarMarca(m: Pick<MarcaZap, "id" | "processo" | "contato_numero" | "status_mensagem" | "situacao">, texto: string, enviadoPor: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const numero = (m.contato_numero ?? "").replace(/\D/g, "");
  if (numero.length < 10) return { ok: false, error: `Processo ${m.processo} sem número de WhatsApp.` };
  const para = numero.length <= 11 ? `55${numero}` : numero;
  const job = await enfileirarMensagem({ para, texto, origemRef: `marca:${m.processo}:${Date.now()}`, expiraEm: new Date(Date.now() + 24 * 3_600_000), criadoPor: enviadoPor });
  if (!job) return { ok: false, error: "Não foi possível pôr a mensagem na fila do WhatsApp." };
  await db().from("marca_envios").insert({ marca_id: m.id, numero: para, texto, status: statusDaMensagem(m), job_id: job, enviado_por: enviadoPor });
  return { ok: true };
}
