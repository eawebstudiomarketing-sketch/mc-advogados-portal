import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listarConversas, statusAgente } from "@/lib/whatsapp";
import { WhatsappApp } from "./whatsapp-app";

export const metadata = { title: "WhatsApp" };

// WhatsApp em tela cheia: carrega só as 300 conversas mais recentes (o resto
// vem rolando ou pela busca) e a agenda depois que a tela aparece.
type Alvo = { conversa?: string; cliente?: string; lead?: string; numero?: string };

/** Link direto para uma conversa (?conversa=jid, ?cliente=id, ?lead=id ou ?numero=telefone): devolve o jid. */
async function resolverConversa(db: Awaited<ReturnType<typeof createClient>>, a: Alvo): Promise<string | null> {
  if (a.conversa) return a.conversa;
  const ultimos8 = (n: string | null | undefined) => (n ?? "").replace(/\D/g, "").slice(-8);
  const porNumero = async (n: string | null | undefined) => {
    const d = ultimos8(n);
    if (d.length < 8) return null;
    const { data } = await db.from("wa_chats").select("chat_jid").eq("is_group", false).like("chat_jid", `%${d}@%`).order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(1);
    return data?.[0]?.chat_jid ?? null;
  };
  if (a.numero) return porNumero(a.numero);
  const coluna = a.cliente ? "client_id" : a.lead ? "lead_id" : null;
  const valor = a.cliente ?? a.lead;
  if (!coluna || !valor) return null;
  // conversa individual primeiro (é com quem se fala); senão o grupo do cliente
  const { data } = await db.from("wa_chats").select("chat_jid, is_group").eq(coluna, valor).order("is_group").order("ultima_msg_em", { ascending: false, nullsFirst: false }).limit(1);
  if (data?.[0]) return data[0].chat_jid;
  // sem conversa ligada: tenta pelo número cadastrado
  if (a.cliente) {
    const { data: c } = await db.from("clients").select("whatsapp_numeros").eq("id", a.cliente).maybeSingle();
    for (const n of c?.whatsapp_numeros ?? []) {
      const j = await porNumero(n);
      if (j) return j;
    }
    return null;
  }
  const { data: l } = await db.from("leads").select("telefone").eq("id", a.lead!).maybeSingle();
  return porNumero(l?.telefone);
}

export default async function WhatsappPage({ searchParams }: { searchParams: Promise<Alvo> }) {
  await exigirPermissao("whatsapp");
  const db = await createClient();
  const alvo = await searchParams;
  const [agente, conversas, clientes, jid] = await Promise.all([
    statusAgente(db),
    listarConversas(db, { limite: 300 }),
    db.from("clients").select("id, name, tipo_pessoa").eq("active", true).order("name"),
    resolverConversa(db, alvo).catch(() => null),
  ]);
  // a conversa pedida pode estar fora das 300 mais recentes (ou arquivada): busca ela
  if (jid && !conversas.some((c) => c.chat_jid === jid)) {
    const digitos = jid.split("@")[0];
    const extra = [...(await listarConversas(db, { busca: digitos, limite: 5 })), ...(await listarConversas(db, { busca: digitos, limite: 5, arquivadas: true }))].find((c) => c.chat_jid === jid);
    if (extra) conversas.unshift(extra);
  }
  const abrirJid = jid && conversas.some((c) => c.chat_jid === jid) ? jid : null;

  return (
    <div className="-mt-2">
      <h1 className="sr-only">WhatsApp</h1>
      <WhatsappApp key={abrirJid ?? "lista"} agenteInicial={agente} conversasIniciais={conversas} clientes={clientes.data ?? []} abrirInicial={abrirJid} />
    </div>
  );
}
