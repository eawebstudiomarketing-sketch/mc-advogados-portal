import Link from "next/link";
import { notFound } from "next/navigation";
import { getOnboarding } from "@/lib/data/onboardings";
import { exigirPermissao } from "@/lib/dal";
import { stagesFromStored } from "@/lib/onboarding-stages";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { deleteOnboardingAction } from "../actions";
import { BackButton } from "@/components/nav/back-button";

export default async function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("onboarding");
  const { id } = await params;
  const onboarding = await getOnboarding(id);
  if (!onboarding) notFound();

  return (
    <div>
      <BackButton fallback="/admin/onboarding" />

      <div className="mt-3 mb-6 flex items-center justify-between">
        <div>
          <h1 className="page-title">Onboarding — {onboarding.clients?.name}</h1>
          <p className="text-sm text-muted">
            Feito por {onboarding.profiles?.full_name ?? "—"} em {new Date(onboarding.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onboarding.downloadUrl && (
            <a
              href={onboarding.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="ui-btn-secondary px-3 py-1.5 text-xs"
            >
              Baixar PDF
            </a>
          )}
          <ConfirmSubmitButton
            action={deleteOnboardingAction}
            hiddenFields={{ id: onboarding.id, client_id: onboarding.client_id, pdf_url: onboarding.pdf_url ?? "" }}
            confirmMessage="Excluir este onboarding? O PDF também será apagado."
            label="Excluir"
            icon="trash"
          />
        </div>
      </div>

      <p className="mb-6 ui-card px-4 py-3 text-sm text-muted">
        As demandas agora são geradas na ficha do cliente, escolhendo a base (triagem, onboarding, ATAs ou um documento).{" "}
        <Link href={`/admin/clients/${onboarding.client_id}?aba=demandas`} className="font-medium text-navy-3 underline-offset-2 hover:underline">
          Ir para gerar demandas
        </Link>
      </p>

      <div className="space-y-4">
        {stagesFromStored(onboarding.questions).map((stage) => (
          <div key={stage.id} className="overflow-hidden ui-card">
            <div className="bg-navy px-4 py-2.5 text-sm font-semibold text-navy-foreground">
              {stage.number}. {stage.icon} {stage.name}
            </div>
            <div className="divide-y divide-border">
              {stage.questions.map((q) => (
                <div key={q.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{q.text}</p>
                  <p className="mt-1 text-sm text-muted">
                    {onboarding.answers[q.id]?.trim() || <span className="italic text-muted">Não respondido.</span>}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
