import Link from "next/link";
import { notFound } from "next/navigation";
import { getOnboarding } from "@/lib/data/onboardings";
import { requireRole } from "@/lib/dal";
import { ONBOARDING_STAGES } from "@/lib/onboarding-schema";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { deleteOnboardingAction } from "../actions";

export default async function OnboardingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"]);
  const { id } = await params;
  const onboarding = await getOnboarding(id);
  if (!onboarding) notFound();

  return (
    <div>
      <Link href="/admin/onboarding" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para onboarding
      </Link>

      <div className="mt-3 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Onboarding — {onboarding.clients?.name}</h1>
          <p className="text-sm text-foreground/50">
            Feito por {onboarding.profiles?.full_name ?? "—"} em {new Date(onboarding.created_at).toLocaleDateString("pt-BR")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {onboarding.downloadUrl && (
            <a
              href={onboarding.downloadUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-navy hover:bg-navy hover:text-navy-foreground"
            >
              Baixar PDF
            </a>
          )}
          <ConfirmSubmitButton
            action={deleteOnboardingAction}
            hiddenFields={{ id: onboarding.id, client_id: onboarding.client_id, pdf_url: onboarding.pdf_url ?? "" }}
            confirmMessage="Excluir este onboarding? O PDF também será apagado."
            label="Excluir"
            className="rounded-lg border border-status-danger px-3 py-1.5 text-xs font-medium text-status-danger hover:bg-status-danger hover:text-white"
          />
        </div>
      </div>

      <div className="space-y-4">
        {ONBOARDING_STAGES.map((stage) => (
          <div key={stage.id} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
            <div className="bg-navy px-4 py-2.5 text-sm font-semibold text-navy-foreground">
              {stage.number}. {stage.icon} {stage.name}
            </div>
            <div className="divide-y divide-border">
              {stage.questions.map((q) => (
                <div key={q.id} className="px-4 py-3">
                  <p className="text-sm font-medium text-foreground">{q.text}</p>
                  <p className="mt-1 text-sm text-foreground/60">
                    {onboarding.answers[q.id]?.trim() || <span className="italic text-foreground/40">Não respondido.</span>}
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
