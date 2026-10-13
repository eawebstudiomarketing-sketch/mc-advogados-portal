import { getPermissoes, requireRole } from "@/lib/dal";
import { NewClientForm } from "./new-client-form";
import { BackButton } from "@/components/nav/back-button";

export default async function NewClientPage() {
  // qualquer pessoa da equipe pode cadastrar cliente
  await requireRole(["admin", "advogado"]);
  const permissoes = (await getPermissoes())!;

  return (
    <div>
      <BackButton fallback={permissoes.clientes ? "/admin/clients" : "/admin"} />

      <h1 className="mt-3 mb-6 page-title">Novo cliente</h1>

      <NewClientForm />
    </div>
  );
}
