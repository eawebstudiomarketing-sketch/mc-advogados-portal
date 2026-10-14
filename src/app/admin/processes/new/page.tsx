import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { ProcessForm } from "./process-form";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";
import { getPublicacao } from "@/lib/data/publicacoes";
import { sugerirClientePelasPartes } from "@/lib/publicacoes/cliente-sugerido";

export default async function NewProcessPage({ searchParams }: { searchParams: Promise<{ numero?: string; publicacao?: string }> }) {
  await exigirPermissao("processos");
  const [clients, { numero, publicacao }] = await Promise.all([listClients(), searchParams]);
  // Vindo de uma publicação do DJEN: vara, área e cliente (pelas partes) já sugeridos.
  const pub = publicacao ? await getPublicacao(publicacao) : null;
  const partes = ((pub?.partes as { nome: string }[] | null) ?? []).map((p) => p.nome);
  const clienteSugerido = pub ? sugerirClientePelasPartes(partes, clients) : null;
  const vara = pub ? [pub.orgao, pub.tribunal].filter(Boolean).join(" · ") : undefined;
  const area = pub?.tribunal?.startsWith("TRT") ? "trabalhista" : undefined;

  return (
    <div>
      <BackButton fallback="/admin/processes" />

      <h1 className="mt-3 mb-6 page-title">Novo processo</h1>

      {clients.length === 0 ? (
        <p className="max-w-md ui-card p-6 text-sm text-muted">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy-3 underline-offset-2 hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de abrir um processo.
        </p>
      ) : (
        <>
          {pub && (
            <p className="mb-4 max-w-xl rounded-lg bg-gold/10 px-3 py-2 text-xs text-navy">
              Dados vindos da publicação do DJEN.{" "}
              {clienteSugerido ? (
                <>Cliente sugerido pelas partes: <strong>{clienteSugerido.name}</strong> — confira.</>
              ) : (
                <>Nenhum cliente bateu com as partes ({partes.join(", ") || "sem partes"}) — escolha o cliente.</>
              )}
            </p>
          )}
          <ProcessForm
            clients={clients}
            numeroInicial={numero ?? pub?.numero_mascara ?? undefined}
            clienteInicial={clienteSugerido?.id}
            varaInicial={vara}
            areaInicial={area}
            exigirCliente={!!pub}
          />
        </>
      )}
    </div>
  );
}
