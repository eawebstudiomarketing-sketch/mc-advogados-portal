import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listarConversas, statusAgente } from "@/lib/whatsapp";
import { WhatsappApp } from "./whatsapp-app";

export const metadata = { title: "WhatsApp" };

// WhatsApp em tela cheia: carrega só as 300 conversas mais recentes (o resto
// vem rolando ou pela busca) e a agenda depois que a tela aparece.
export default async function WhatsappPage() {
  await exigirPermissao("whatsapp");
  const db = await createClient();
  const [agente, conversas, clientes] = await Promise.all([
    statusAgente(db),
    listarConversas(db, { limite: 300 }),
    db.from("clients").select("id, name, tipo_pessoa").eq("active", true).order("name"),
  ]);

  return (
    <div className="-mt-2">
      <h1 className="sr-only">WhatsApp</h1>
      <WhatsappApp agenteInicial={agente} conversasIniciais={conversas} clientes={clientes.data ?? []} />
    </div>
  );
}
