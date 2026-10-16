import Link from "next/link";
import { MessageCircle, Pencil, CheckCircle2, CircleDashed } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

// Só admin: grupos/números do WhatsApp do cliente e quais conversas o
// sistema já encontrou e vinculou (é por elas que saem os lembretes).

const txt = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const telChave = (t: string) => {
  let d = t.replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : null;
};

export async function WhatsappCard({ clientId, grupos, numeros }: { clientId: string; grupos: string[]; numeros: string[] }) {
  const { data: chats } = await createAdminClient()
    .from("wa_chats")
    .select("chat_jid, nome, is_group, vinculo_auto, ultima_msg_em")
    .eq("client_id", clientId)
    .order("ultima_msg_em", { ascending: false, nullsFirst: false });
  const lista = chats ?? [];
  const achouGrupo = (g: string) => lista.some((c) => c.is_group && txt(c.nome ?? "") === txt(g));
  const achouNumero = (n: string) => lista.some((c) => !c.is_group && telChave(c.chat_jid.split("@")[0]) === telChave(n));
  const manuais = lista.filter((c) => !c.vinculo_auto);

  return (
    <section className="ui-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted" aria-hidden /> WhatsApp do cliente
        </h2>
        <Link href={`/admin/clients/${clientId}/edit`} className="ui-link text-xs">
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar grupos e números
        </Link>
      </div>
      {grupos.length === 0 && numeros.length === 0 && manuais.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nenhum grupo ou número cadastrado. Cadastre para o portal ler os pedidos do grupo e mandar os lembretes de reunião.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {grupos.map((g) => (
            <li key={`g-${g}`} className="flex items-center gap-2">
              {achouGrupo(g) ? <CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden /> : <CircleDashed className="h-4 w-4 text-muted" aria-hidden />}
              <span className="text-foreground">Grupo “{g}”</span>
              <span className="text-xs text-muted">{achouGrupo(g) ? "vinculado" : "ainda não encontrado no WhatsApp conectado"}</span>
            </li>
          ))}
          {numeros.map((n) => (
            <li key={`n-${n}`} className="flex items-center gap-2">
              {achouNumero(n) ? <CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden /> : <CircleDashed className="h-4 w-4 text-muted" aria-hidden />}
              <span className="text-foreground">{n}</span>
              <span className="text-xs text-muted">{achouNumero(n) ? "vinculado" : "sem conversa ainda (o lembrete sai direto para o número)"}</span>
            </li>
          ))}
          {manuais.map((c) => (
            <li key={c.chat_jid} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden />
              <span className="text-foreground">{c.nome ?? c.chat_jid}</span>
              <span className="text-xs text-muted">vinculado à mão na tela WhatsApp</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
