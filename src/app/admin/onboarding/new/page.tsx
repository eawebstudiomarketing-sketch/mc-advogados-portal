import Link from "next/link";
import { BackButton } from "@/components/nav/back-button";
import { listClients } from "@/lib/data/clients";
import { listPerguntasModelo } from "@/lib/data/onboarding-modelo";
import { comPerguntasDoModelo } from "@/lib/onboarding-stages";
import { ONBOARDING_STAGES } from "@/lib/onboarding-schema";
import { exigirPermissao } from "@/lib/dal";
import { OnboardingForm } from "./onboarding-form";
import { OnboardingIa } from "./onboarding-ia";

// A geração das perguntas pelo Gemini roda numa server action desta página.
export const maxDuration = 120;

export default async function NewOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; modo?: string }>;
}) {
  await exigirPermissao("onboarding");
  const [clients, { clientId, modo }, extras] = await Promise.all([listClients(), searchParams, listPerguntasModelo().catch(() => [])]);
  const cliente = clientId ? clients.find((c) => c.id === clientId) : undefined;
  // Pela ficha do cliente, o padrão é o onboarding personalizado (Gemini);
  // "modo=padrao" usa as perguntas fixas do modelo.
  const personalizado = !!cliente && modo !== "padrao";

  return (
    <div>
      <BackButton fallback={cliente ? `/admin/clients/${cliente.id}` : "/admin/onboarding"} />

      <div className="mt-3 mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="page-title">
          {personalizado ? "Novo onboarding personalizado" : "Novo onboarding (perguntas padrão)"}
        </h1>
        {cliente && (
          <Link
            href={`/admin/onboarding/new?clientId=${cliente.id}${personalizado ? "&modo=padrao" : ""}`}
            className="text-xs font-medium text-muted hover:underline"
          >
            {personalizado ? "Usar as perguntas padrão" : "Gerar perguntas com IA"}
          </Link>
        )}
      </div>

      {clients.length === 0 ? (
        <p className="max-w-md ui-card p-6 text-sm text-muted">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy-3 underline-offset-2 hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de fazer o onboarding.
        </p>
      ) : personalizado ? (
        <OnboardingIa client={cliente} extras={extras} />
      ) : (
        <>
          {!cliente && (
            <p className="mb-4 max-w-2xl text-xs text-muted">
              Para o onboarding com perguntas geradas pela IA, abra pela ficha do cliente (botão “Gerar onboarding”).
            </p>
          )}
          <OnboardingForm clients={clients} preselectedClientId={clientId} stages={comPerguntasDoModelo(ONBOARDING_STAGES, extras)} />
        </>
      )}
    </div>
  );
}
