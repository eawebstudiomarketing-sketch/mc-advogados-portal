import { AtividadeLink } from "@/components/atividade/atividade-modal";
import type { DemandDraft } from "@/lib/data/onboarding-demand-drafts";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL } from "@/lib/activity-type";
import { approveDraftAction, discardDraftAction, saveDraftAction } from "../demand-actions";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-muted";

const PRIORITY_LABEL = { alta: "Alta", media: "Média", baixa: "Baixa" } as const;

const PRIORITY_BADGE: Record<DemandDraft["priority"], string> = {
  alta: "bg-status-danger/10 text-status-danger",
  media: "bg-status-pending/10 text-status-pending",
  baixa: "bg-foreground/10 text-muted",
};

function fontesDe(d: DemandDraft): string {
  if (!Array.isArray(d.sources)) return "";
  return (d.sources as { titulo?: string }[]).map((f) => f.titulo).filter(Boolean).join(" · ");
}

export function DemandsSection({ clientId, drafts }: { clientId: string; drafts: DemandDraft[] }) {
  const pending = drafts.filter((d) => d.status === "rascunho");
  const approved = drafts.filter((d) => d.status === "aprovada");
  const discarded = drafts.filter((d) => d.status === "descartada");

  return (
    <section>
      {drafts.length === 0 && (
        <p className="py-3 text-sm text-muted">Nenhuma demanda gerada ainda.</p>
      )}

      {pending.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border">
          {pending.map((d) => (
            <form key={d.id} className="space-y-3 px-4 py-4">
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="client_id" value={clientId} />

              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[d.priority]}`}>
                  Prioridade {PRIORITY_LABEL[d.priority]}
                </span>
                {fontesDe(d) && <span className="text-xs text-muted">Base: {fontesDe(d)}</span>}
              </div>

              <div>
                <label className={labelClass}>Título</label>
                <input name="title" defaultValue={d.title} required className={inputClass} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelClass}>Prioridade</label>
                  <select name="priority" defaultValue={d.priority} className={inputClass}>
                    <option value="alta">Alta</option>
                    <option value="media">Média</option>
                    <option value="baixa">Baixa</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Tipo</label>
                  <select name="activity_type" defaultValue={d.activity_type} className={inputClass}>
                    {ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {ACTIVITY_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Prazo</label>
                  <input type="date" name="deadline" defaultValue={d.deadline ?? ""} className={inputClass} />
                </div>
              </div>

              <div>
                <label className={labelClass}>Ação sugerida</label>
                <textarea name="action" defaultValue={d.action} rows={2} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Motivo</label>
                <textarea name="reason" defaultValue={d.reason} rows={2} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Próximo passo</label>
                <textarea name="next_step" defaultValue={d.next_step} rows={2} className={inputClass} />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="submit"
                  formAction={approveDraftAction}
                  className="ui-btn px-3 py-1.5 text-xs"
                >
                  Aprovar e criar atividade
                </button>
                <button
                  type="submit"
                  formAction={saveDraftAction}
                  className="ui-btn-secondary px-3 py-1.5 text-xs"
                >
                  Salvar edição
                </button>
                <button
                  type="submit"
                  formAction={discardDraftAction}
                  className="rounded-lg border border-status-danger px-3 py-1.5 text-xs font-medium text-status-danger hover:bg-status-danger hover:text-white"
                >
                  Descartar
                </button>
              </div>
            </form>
          ))}
        </div>
      )}

      {approved.length > 0 && (
        <div className="mt-3 px-1">
          <p className="text-xs font-medium text-muted">Aprovadas (viraram atividades)</p>
          <ul className="mt-2 space-y-1">
            {approved.map((d) => (
              <li key={d.id} className="text-sm text-foreground">
                {d.activity_id ? (
                  <AtividadeLink id={d.activity_id} className="text-navy hover:underline">
                    {d.title}
                  </AtividadeLink>
                ) : (
                  d.title
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {discarded.length > 0 && (
        <p className="mt-3 px-1 text-xs text-muted">
          {discarded.length} {discarded.length === 1 ? "demanda descartada" : "demandas descartadas"}.
        </p>
      )}
    </section>
  );
}
