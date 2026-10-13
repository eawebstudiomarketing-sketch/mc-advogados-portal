import Link from "next/link";
import { Download, Eye, Plus } from "lucide-react";
import { listOnboardings } from "@/lib/data/onboardings";
import { exigirPermissao } from "@/lib/dal";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { deleteOnboardingAction, deletePerguntaModeloAction } from "./actions";
import { listPerguntasModelo } from "@/lib/data/onboarding-modelo";
import { ONBOARDING_STAGES } from "@/lib/onboarding-schema";

export default async function AdminOnboardingPage() {
  await exigirPermissao("onboarding");
  const [onboardings, extras] = await Promise.all([listOnboardings(), listPerguntasModelo().catch(() => [])]);

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Onboarding</h1>
          <p className="text-sm text-muted">Onboarding de clientes novos — perguntas, ações e PDF salvos por cliente</p>
        </div>
        <Link
          href="/admin/onboarding/new"
          className="ui-btn"
        >
          <Plus className="h-4 w-4" aria-hidden /> Novo onboarding
        </Link>
      </div>

      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-5 py-2.5 font-medium">Cliente</th>
              <th className="px-5 py-2.5 font-medium">Feito por</th>
              <th className="px-5 py-2.5 font-medium">Data</th>
              <th className="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {onboardings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-sm text-muted">
                  Nenhum onboarding registrado ainda.
                </td>
              </tr>
            )}
            {onboardings.map((o) => (
              <tr key={o.id}>
                <td className="px-5 py-3 font-medium text-foreground">{o.clients?.name}</td>
                <td className="px-5 py-3 text-foreground/70">{o.profiles?.full_name ?? "—"}</td>
                <td className="px-5 py-3 text-foreground/70">
                  {new Date(o.created_at).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    <Link href={`/admin/onboarding/${o.id}`} className="icon-btn" aria-label="Ver" data-tip="Ver"><Eye aria-hidden /></Link>
                    {o.downloadUrl && (
                      <a href={o.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Baixar PDF" data-tip="Baixar PDF"><Download aria-hidden /></a>
                    )}
                    <ConfirmSubmitButton
                      action={deleteOnboardingAction}
                      hiddenFields={{ id: o.id, client_id: o.client_id, pdf_url: o.pdf_url ?? "" }}
                      confirmMessage={`Excluir o onboarding de "${o.clients?.name}"? O PDF também será apagado.`}
                      label="Excluir"
                      icon="trash"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-8 ui-card p-5">
        <h2 className="section-title">Perguntas extras do modelo</h2>
        <p className="mt-1 text-xs text-muted">
          Perguntas que você marcou como &ldquo;usar também nos próximos onboardings&rdquo;. Entram no fim da etapa em todo onboarding novo (padrão ou com IA).
        </p>
        {extras.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhuma ainda. Ao preencher um onboarding, use &ldquo;+ Adicionar pergunta&rdquo; e marque a caixinha.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {extras.map((e) => {
              const etapa = ONBOARDING_STAGES.find((s) => s.id === e.stage_id);
              return (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="shrink-0 rounded-md bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-foreground/70">
                    Etapa {etapa?.number ?? "?"}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-foreground">{e.texto}</span>
                  <ConfirmSubmitButton
                    action={deletePerguntaModeloAction}
                    hiddenFields={{ id: e.id }}
                    confirmMessage="Tirar esta pergunta do modelo? Os onboardings já feitos não mudam."
                    label="Tirar do modelo"
                    icon="trash"
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
