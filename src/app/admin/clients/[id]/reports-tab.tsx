"use client";

import { EnviarRelatorioZap } from "@/components/relatorio/enviar-zap";
import { useActionState } from "react";
import { BarChart3, Download, FileBarChart2 } from "lucide-react";
import { generateReportAction, type GenerateReportState } from "@/app/admin/reports/actions";
import { SendReportButton } from "@/app/admin/reports/send-report-button";
import { EmptyState } from "@/components/ui/empty-state";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export type RelatorioItem = {
  id: string;
  reference_month: number;
  reference_year: number;
  created_at: string;
  sent_at: string | null;
  downloadUrl: string | null;
};

const initialState: GenerateReportState = { error: null };

// Aba Relatórios da ficha do cliente: gerar o relatório do mês e ver/baixar/enviar os já gerados.
export function ReportsTab({ clientId, relatorios, podeZap = false }: { clientId: string; relatorios: RelatorioItem[]; podeZap?: boolean }) {
  const [state, formAction, pending] = useActionState(generateReportAction, initialState);
  const agora = new Date();
  const anos = [agora.getFullYear(), agora.getFullYear() - 1, agora.getFullYear() - 2];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <section className="ui-card h-fit p-5 lg:col-span-2">
        <h2 className="section-title flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-gold" aria-hidden /> Gerar relatório
        </h2>
        <p className="mt-0.5 text-xs text-muted">Atividades concluídas no mês, em andamento e a fazer.</p>

        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="return_to" value={`/admin/clients/${clientId}?aba=arquivos`} />
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <div>
              <label htmlFor="rel-mes" className="ui-label">
                Mês
              </label>
              <select id="rel-mes" name="reference_month" defaultValue={agora.getMonth() + 1} className="ui-input">
                {MESES.slice(1).map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rel-ano" className="ui-label">
                Ano
              </label>
              <select id="rel-ano" name="reference_year" defaultValue={agora.getFullYear()} className="ui-input">
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {state.error && <p className="text-sm text-status-danger">{state.error}</p>}
          <button type="submit" disabled={pending} className="ui-btn w-full">
            <FileBarChart2 className="h-4 w-4 text-gold-2" aria-hidden />
            {pending ? "Gerando o PDF..." : "Gerar relatório"}
          </button>
          <p className="text-xs text-muted">Se já existir um relatório desse mês, ele é substituído.</p>
        </form>
      </section>

      <section className="ui-card p-5 lg:col-span-3">
        <h2 className="section-title">
          Relatórios gerados {relatorios.length ? <span className="text-muted tabular-nums">· {relatorios.length}</span> : null}
        </h2>
        {relatorios.length === 0 ? (
          <EmptyState icon={FileBarChart2} title="Nenhum relatório gerado ainda" compact />
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {relatorios.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy text-gold-2">
                  <FileBarChart2 className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {MESES[r.reference_month]} de {r.reference_year}
                  </p>
                  <p className="text-xs text-muted">
                    Gerado em {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    {r.sent_at ? ` · enviado em ${new Date(r.sent_at).toLocaleDateString("pt-BR")}` : " · não enviado"}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  {r.downloadUrl && (
                    <a href={r.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Baixar PDF" data-tip="Baixar PDF">
                      <Download aria-hidden />
                    </a>
                  )}
                  {podeZap && <EnviarRelatorioZap reportId={r.id} />}
                  <SendReportButton reportId={r.id} alreadySent={!!r.sent_at} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
