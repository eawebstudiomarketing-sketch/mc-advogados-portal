import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { ProcessForm } from "./process-form";
import { NovoProcesso } from "./novo-processo";
import { BackButton } from "@/components/nav/back-button";
import { exigirPermissao } from "@/lib/dal";
import { getPublicacao } from "@/lib/data/publicacoes";
import { sugerirClientePelasPartes } from "@/lib/publicacoes/cliente-sugerido";
import { listarCandidatosAbertos } from "@/lib/processos-busca/candidatos";
import { mascaraCnj } from "@/lib/processos-busca/fontes";
import { createAdminClient } from "@/lib/supabase/admin";

// Novo processo = pesquisa (30/10/2026): pesquisa pelo número, nome, CPF/CNPJ ou OAB → o robô lê
// no tribunal → a pessoa confere a prévia e aprova. O cadastro à mão continua para o que não tem
// número CNJ (administrativo, extrajudicial).
export default async function NewProcessPage({ searchParams }: { searchParams: Promise<{ numero?: string; publicacao?: string; cliente?: string; manual?: string }> }) {
  await exigirPermissao("processos");
  const [clients, { numero, publicacao, cliente, manual }, candidatos, { data: oabs }] = await Promise.all([
    listClients(),
    searchParams,
    listarCandidatosAbertos(),
    createAdminClient().from("monitor_oabs").select("numero, uf").eq("ativo", true),
  ]);
  // Vindo de uma publicação do DJEN: vara, área e cliente (pelas partes) já sugeridos.
  const pub = publicacao ? await getPublicacao(publicacao) : null;
  const partes = ((pub?.partes as { nome: string }[] | null) ?? []).map((p) => p.nome);
  const clienteSugerido = pub ? sugerirClientePelasPartes(partes, clients) : null;
  const vara = pub ? [pub.orgao, pub.tribunal].filter(Boolean).join(" · ") : undefined;
  const area = pub?.tribunal?.startsWith("TRT") ? "trabalhista" : pub?.tribunal === "INPI" ? "empresarial" : undefined;
  const numeroPesquisa = mascaraCnj(numero ?? pub?.numero_mascara ?? pub?.numero_processo ?? "") ?? undefined;
  // INPI (marca) e números sem CNJ seguem no cadastro à mão
  const aMao = manual === "1" || (!!pub && (pub.tribunal === "INPI" || !numeroPesquisa));

  return (
    <div>
      <BackButton fallback={cliente ? `/admin/clients/${cliente}?aba=processos` : "/admin/processes"} />

      <div className="mt-3 mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Novo processo</h1>
          <p className="mt-1 text-sm text-muted">Pesquise, confira o processo lido direto do tribunal e aprove. Ao aprovar, entra todo o histórico e o portal passa a acompanhar os andamentos novos.</p>
        </div>
        <Link href={aMao ? "/admin/processes/new" : "/admin/processes/new?manual=1"} className="ui-btn-secondary text-xs">
          {aMao ? "Voltar para a pesquisa" : "Cadastrar à mão (sem número CNJ)"}
        </Link>
      </div>

      {aMao ? (
        clients.length === 0 ? (
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
              clienteInicial={clienteSugerido?.id ?? (clients.some((c) => c.id === cliente) ? cliente : undefined)}
              varaInicial={vara}
              areaInicial={area}
              exigirCliente={!!pub}
            />
          </>
        )
      ) : (
        <NovoProcesso candidatos={candidatos} clients={clients.map((c) => ({ id: c.id, name: c.name }))} oabs={oabs ?? []} numeroInicial={numeroPesquisa} clienteInicial={clienteSugerido?.id ?? (clients.some((c) => c.id === cliente) ? cliente : undefined)} />
      )}
    </div>
  );
}
