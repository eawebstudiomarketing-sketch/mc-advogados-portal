import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { listResponsaveis, responsavelDoPerfil } from "@/lib/data/responsaveis";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";
import { ActivityForm } from "./activity-form";

export default async function NewActivityPage({ searchParams }: { searchParams: Promise<{ clientId?: string; titulo?: string; descricao?: string; prazo?: string; tipo?: string; publicacao?: string }> }) {
  const [profile, clients, responsaveis, { clientId, ...preenchido }] = await Promise.all([
    exigirPermissao("atividades").then((r) => r.profile),
    listClients(),
    listResponsaveis(),
    searchParams,
  ]);
  const meuResponsavel = await responsavelDoPerfil(profile.id);

  return (
    <div>
      <BackButton fallback="/admin/activities" />

      <h1 className="mt-3 mb-6 page-title">Nova atividade</h1>

      {clients.length === 0 ? (
        <p className="max-w-md ui-card p-6 text-sm text-muted">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy-3 underline-offset-2 hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de abrir uma atividade.
        </p>
      ) : (
        <ActivityForm clients={clients} responsaveis={responsaveis} meuResponsavel={meuResponsavel} clienteInicial={clientId} inicial={preenchido} />
      )}
    </div>
  );
}
