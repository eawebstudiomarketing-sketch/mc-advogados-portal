import { Gavel } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { listProcesses } from "@/lib/data/processes";
import { EmptyState } from "@/components/ui/empty-state";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

// Processos do cliente (acompanhamento). Em cartões para funcionar no celular.
export default async function ClientProcessesPage() {
  const profile = await requireRole(["client"]);
  const processos = await listProcesses({ clientId: profile.client_id! });

  return (
    <div>
      <div className="mb-8">
        <p className="eyebrow">Processos</p>
        <h1 className="page-title mt-2">Seus processos.</h1>
        <p className="mt-2 text-[15px] text-foreground/70">Acompanhados pelo escritório.</p>
      </div>

      {processos.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={Gavel} title="Nenhum processo em andamento">
            Quando houver um processo seu, ele aparece aqui com a fase atualizada.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {processos.map((p) => (
            <li key={p.id} className="ui-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy/[0.07] text-navy-3">
                  <Gavel className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-[15px] font-medium tabular-nums text-foreground">{p.numero_processo}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {PROCESS_AREA_LABEL[p.area] ?? p.area}
                    {p.vara_tribunal ? ` · ${p.vara_tribunal}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {p.fase && <span className="rounded-full bg-gold-soft px-2.5 py-1 font-medium text-gold-ink">Fase: {p.fase}</span>}
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-muted ring-1 ring-border">Atualizado em {dataBR(p.updated_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
