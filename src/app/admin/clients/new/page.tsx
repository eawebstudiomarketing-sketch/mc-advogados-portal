import { getPermissoes, requireRole } from "@/lib/dal";
import { NewClientForm } from "./new-client-form";
import { BackButton } from "@/components/nav/back-button";

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  // qualquer pessoa da equipe pode cadastrar cliente
  await requireRole(["admin", "advogado"]);
  const permissoes = (await getPermissoes())!;
  const { tipo } = await searchParams;
  const pf = tipo === "PF" && !!permissoes.clientes_pf;

  return (
    <div>
      <BackButton fallback={permissoes.clientes ? `/admin/clients${pf ? "?aba=pf" : ""}` : "/admin"} />

      <h1 className="mt-3 mb-6 page-title">{pf ? "Nova pessoa física" : "Novo cliente"}</h1>

      <NewClientForm tipoInicial={pf ? "PF" : "PJ"} podePF={!!permissoes.clientes_pf} />
    </div>
  );
}
