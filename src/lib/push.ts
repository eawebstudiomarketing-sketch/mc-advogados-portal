import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Envio de avisos no celular (Web Push) para os aparelhos que cada pessoa
// ativou. Aparelho que não existe mais (404/410) é apagado da lista.

let configurado = false;
function configurar(): boolean {
  if (configurado) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:contato@mcadvogados.app.br", pub, priv);
  configurado = true;
  return true;
}

export type AvisoPush = { titulo: string; corpo: string; url: string; tag?: string };

/** Manda para todos os aparelhos dos perfis indicados. Devolve quantos receberam. */
export async function enviarPush(profileIds: string[], aviso: AvisoPush): Promise<number> {
  if (!profileIds.length || !configurar()) return 0;
  const db = createAdminClient();
  const { data: inscricoes } = await db.from("push_inscricoes").select("id, endpoint, p256dh, auth").in("profile_id", profileIds);
  let enviados = 0;
  for (const i of inscricoes ?? []) {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify(aviso), { TTL: 60 * 60 * 12 });
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from("push_inscricoes").delete().eq("id", i.id);
    }
  }
  return enviados;
}

/** Ids dos admins (o sininho e o aviso no celular, por enquanto, são só deles). */
export async function idsDosAdmins(): Promise<string[]> {
  const { data } = await createAdminClient().from("profiles").select("id").eq("role", "admin").eq("ativo", true);
  return (data ?? []).map((p) => p.id);
}
