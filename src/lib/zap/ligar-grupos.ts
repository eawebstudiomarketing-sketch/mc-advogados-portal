import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarAvisos } from "@/lib/avisos";
import { idsDosAdmins } from "@/lib/push";

// Grupo "Assessoria Jurídica - X" sem cliente: liga sozinho ao cliente cujo nome
// (ou apelido) contém todas as palavras de X. Sem certeza (nenhum ou mais de um
// candidato), avisa o admin em vez de adivinhar. As demandas pendentes que já
// vieram do grupo ganham o cliente junto.

type Db = ReturnType<typeof createAdminClient>;

const GENERICAS = new Set(["GRUPO", "DE", "DA", "DO", "DOS", "DAS", "E", "LTDA", "ME", "EPP", "SA", "EIRELI", "CIA", "THE"]);
const palavras = (t: string | null | undefined) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .match(/[A-Z0-9]{2,}/g)
    ?.filter((w) => !GENERICAS.has(w)) ?? [];

/** "Assessoria Jurídica - Ferraz Alimentos" → ["FERRAZ", "ALIMENTOS"]; sem nada depois → []. */
function nomeDoCliente(grupo: string): string[] {
  const resto = grupo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/.*?assessoria\s+jur[ií]?dica/i, "");
  return palavras(resto).filter((w) => w.length >= 3);
}

export async function ligarGruposDeAssessoria(db: Db = createAdminClient()): Promise<{ ligados: string[]; duvidas: string[] }> {
  const r = { ligados: [] as string[], duvidas: [] as string[] };
  const [{ data: grupos }, { data: clientes }] = await Promise.all([
    db.from("wa_chats").select("chat_jid, nome").eq("is_group", true).is("client_id", null).eq("arquivado", false).ilike("nome", "%assessoria%jur%dica%"),
    db.from("clients").select("id, name, apelido").is("archived_at", null),
  ]);
  for (const g of grupos ?? []) {
    const alvo = nomeDoCliente(g.nome ?? "");
    if (!alvo.length) continue; // ex.: "Demandas Assessoria Jurídica" (grupo interno)
    const candidatos = (clientes ?? []).filter((c) => {
      const do_cliente = new Set([...palavras(c.name), ...palavras(c.apelido)]);
      return alvo.every((w) => do_cliente.has(w));
    });
    if (candidatos.length === 1) {
      const c = candidatos[0];
      await db.from("wa_chats").update({ client_id: c.id }).eq("chat_jid", g.chat_jid).is("client_id", null);
      await db.from("distribuicao").update({ client_id: c.id }).eq("chat_jid", g.chat_jid).is("client_id", null).eq("status", "pendente");
      r.ligados.push(`${g.nome} → ${c.name}`);
      continue;
    }
    r.duvidas.push(g.nome ?? g.chat_jid);
    // avisa no máximo uma vez por semana por grupo
    const titulo = `Grupo sem cliente: ${g.nome}`;
    const { count } = await db
      .from("avisos")
      .select("id", { count: "exact", head: true })
      .eq("titulo", titulo)
      .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
    if (count) continue;
    const admins = await idsDosAdmins();
    await criarAvisos(
      admins.map((profile_id) => ({
        profile_id,
        tipo: "zap",
        titulo,
        corpo: candidatos.length
          ? `Mais de um cliente parecido (${candidatos.map((c) => c.name).join(", ")}). Ligue o grupo à ficha certa no WhatsApp.`
          : "Nenhum cliente com esse nome. Ligue o grupo à ficha no WhatsApp (perfil do grupo).",
        url: "/admin/whatsapp",
      }))
    ).catch(() => undefined);
  }
  return r;
}
