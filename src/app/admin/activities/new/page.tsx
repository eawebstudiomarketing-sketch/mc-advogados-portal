import { getEscritorioConfig } from "@/lib/data/escritorio";
import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { listResponsaveis, responsavelDoPerfil } from "@/lib/data/responsaveis";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";
import { ActivityForm } from "./activity-form";
import { getPublicacao } from "@/lib/data/publicacoes";
import { sugerirClientePelasPartes } from "@/lib/publicacoes/cliente-sugerido";

export default async function NewActivityPage({ searchParams }: { searchParams: Promise<{ clientId?: string; titulo?: string; descricao?: string; prazo?: string; tipo?: string; publicacao?: string; categoria?: string; hora?: string; sugestao?: string }> }) {
  const [profile, clients, responsaveis, { clientId, ...preenchido }] = await Promise.all([
    exigirPermissao("atividades").then((r) => r.profile),
    listClients(),
    listResponsaveis(),
    searchParams,
  ]);
  const [meuResponsavel, etiquetas] = await Promise.all([responsavelDoPerfil(profile.id), listEtiquetas()]);
  // Publicação sem processo cadastrado: tenta achar o cliente pelas partes.
  let clienteInicial = clientId;
  if (!clienteInicial && preenchido.publicacao) {
    const pub = await getPublicacao(preenchido.publicacao);
    const partes = ((pub?.partes as { nome: string }[] | null) ?? []).map((p) => p.nome);
    clienteInicial = sugerirClientePelasPartes(partes, clients)?.id;
  }

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
        <ActivityForm etiquetas={etiquetas} clients={clients} responsaveis={responsaveis} meuResponsavel={meuResponsavel} clienteInicial={clienteInicial} inicial={preenchido} areas={(await getEscritorioConfig()).areas} />
      )}
    </div>
  );
}
