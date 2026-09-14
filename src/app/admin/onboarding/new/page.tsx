import Link from "next/link";
import { listClients } from "@/lib/data/clients";
import { requireRole } from "@/lib/dal";
import { OnboardingForm } from "./onboarding-form";

export default async function NewOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requireRole(["admin"]);
  const [clients, { clientId }] = await Promise.all([listClients(), searchParams]);

  return (
    <div>
      <Link href="/admin/onboarding" className="text-xs font-medium text-navy hover:underline">
        ← Voltar para onboarding
      </Link>

      <h1 className="mt-3 mb-6 text-xl font-semibold text-navy">Novo onboarding</h1>

      {clients.length === 0 ? (
        <p className="max-w-md rounded-xl border border-border bg-surface p-6 text-sm text-foreground/60 shadow-sm">
          Nenhum cliente cadastrado ainda.{" "}
          <Link href="/admin/clients/new" className="font-medium text-navy hover:underline">
            Cadastre um cliente
          </Link>{" "}
          antes de fazer o onboarding.
        </p>
      ) : (
        <OnboardingForm clients={clients} preselectedClientId={clientId} />
      )}
    </div>
  );
}
