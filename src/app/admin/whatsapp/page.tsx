import { requireRole } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listarContatos, listarConversas, statusAgente } from "@/lib/whatsapp";
import { WhatsappApp } from "./whatsapp-app";

export const metadata = { title: "WhatsApp" };

export default async function WhatsappPage() {
  await requireRole(["admin"]);
  const db = await createClient();
  const [agente, conversas, contatos, clientes] = await Promise.all([
    statusAgente(db),
    listarConversas(db, { limite: 5000 }),
    listarContatos(db),
    db.from("clients").select("id, name").eq("active", true).order("name"),
  ]);

  return (
    <div>
      <div className="mb-4">
        <p className="eyebrow mb-2">Dia a dia · WhatsApp do escritório</p>
        <h1 className="page-title">WhatsApp</h1>
        <p className="text-sm text-muted">
          WhatsApp do escritório ao vivo, com backup permanente: o que for apagado no celular continua aqui. Para mandar a IA agir, use o assistente (Ctrl+J).
        </p>
      </div>
      <WhatsappApp agenteInicial={agente} conversasIniciais={conversas} contatos={contatos} clientes={clientes.data ?? []} />
    </div>
  );
}
