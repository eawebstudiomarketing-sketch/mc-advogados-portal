import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listarConversas, statusAgente } from "@/lib/whatsapp";
import { WhatsappApp } from "./whatsapp-app";

export const metadata = { title: "WhatsApp" };

export default async function WhatsappPage() {
  await requireRole(["admin"]);
  const db = await createClient();
  const [agente, conversas, clientes] = await Promise.all([
    statusAgente(db),
    listarConversas(db, { limite: 200 }),
    db.from("clients").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="page-title">WhatsApp</h1>
        <p className="text-sm text-muted">
          Espelho do WhatsApp do escritório, ao vivo enquanto o Agente MC estiver ligado. Para mandar a IA agir, use o assistente (Ctrl+J).
        </p>
      </div>
      <WhatsappApp agenteInicial={agente} conversasIniciais={conversas} clientes={clientes.data ?? []} />
    </div>
  );
}
