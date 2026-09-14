import Link from "next/link";
import { listOnboardings } from "@/lib/data/onboardings";
import { requireRole } from "@/lib/dal";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { deleteOnboardingAction } from "./actions";

export default async function AdminOnboardingPage() {
  await requireRole(["admin"]);
  const onboardings = await listOnboardings();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Onboarding</h1>
          <p className="text-sm text-foreground/50">Onboarding de clientes novos — perguntas, ações e PDF salvos por cliente</p>
        </div>
        <Link
          href="/admin/onboarding/new"
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90"
        >
          Novo onboarding
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Feito por</th>
              <th className="px-5 py-3 font-medium">Data</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {onboardings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-sm text-foreground/50">
                  Nenhum onboarding registrado ainda.
                </td>
              </tr>
            )}
            {onboardings.map((o) => (
              <tr key={o.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{o.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{o.profiles?.full_name ?? "—"}</td>
                <td className="px-5 py-3 text-foreground/70">
                  {new Date(o.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/admin/onboarding/${o.id}`} className="text-xs font-medium text-navy hover:underline">
                      Ver
                    </Link>
                    {o.downloadUrl && (
                      <a href={o.downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy hover:underline">
                        Baixar PDF
                      </a>
                    )}
                    <ConfirmSubmitButton
                      action={deleteOnboardingAction}
                      hiddenFields={{ id: o.id, client_id: o.client_id, pdf_url: o.pdf_url ?? "" }}
                      confirmMessage={`Excluir o onboarding de "${o.clients?.name}"? O PDF também será apagado.`}
                      label="Excluir"
                      className="text-xs font-medium text-status-danger hover:underline"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
