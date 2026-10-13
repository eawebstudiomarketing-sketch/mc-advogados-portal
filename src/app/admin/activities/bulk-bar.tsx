"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, Loader2, Trash2, X, CircleDot, Archive, ArchiveRestore } from "lucide-react";
import { ACTIVITY_STATUS_LABEL, ACTIVITY_STATUSES } from "@/lib/activity-status";
import { bulkArchiveActivitiesAction, bulkDeleteActivitiesAction, bulkUpdateDeadlineAction, bulkUpdateStatusAction, type BulkResult } from "./actions";

const DOT: Record<string, string> = {
  aberta: "bg-status-pending",
  em_andamento: "bg-status-info",
  concluida: "bg-status-success",
  cancelada: "bg-border-strong",
};

const plural = (n: number) => (n === 1 ? "1 atividade" : `${n} atividades`);

// Barra que aparece embaixo quando há atividades marcadas na lista.
export function BulkBar({ ids, onLimpar, arquivadas = false, podeExcluir = true }: { ids: string[]; onLimpar: () => void; arquivadas?: boolean; podeExcluir?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [menu, setMenu] = useState<"status" | "prazo" | null>(null);
  const [data, setData] = useState("");
  const barraRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: MouseEvent) => {
      if (barraRef.current && !barraRef.current.contains(e.target as Node)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  if (ids.length === 0) return null;

  function rodar(acao: () => Promise<BulkResult>, sucesso: (n: number) => string) {
    setMenu(null);
    start(async () => {
      const r = await acao();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(sucesso(r.count));
      onLimpar();
      router.refresh();
    });
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
      <div
        ref={barraRef}
        role="toolbar"
        aria-label="Ações para as atividades selecionadas"
        className="pointer-events-auto relative flex animate-enter flex-wrap items-center gap-1 rounded-2xl bg-navy-2 p-1.5 pl-4 text-white shadow-lg"
      >
        <span className="mr-2 text-sm font-medium tabular-nums">
          {ids.length} {ids.length === 1 ? "selecionada" : "selecionadas"}
        </span>

        {/* status */}
        <div className="relative">
          <button
            type="button"
            disabled={pending}
            onClick={() => setMenu(menu === "status" ? null : "status")}
            aria-expanded={menu === "status"}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <CircleDot className="h-4 w-4 text-gold-2" aria-hidden /> Status <ChevronDown className="h-3.5 w-3.5 text-white/50" aria-hidden />
          </button>
          {menu === "status" && (
            <ul className="absolute bottom-full left-0 mb-2 w-48 animate-enter overflow-hidden rounded-xl border border-border bg-surface p-1 text-foreground shadow-lg">
              {ACTIVITY_STATUSES.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() =>
                      rodar(
                        () => bulkUpdateStatusAction(ids, s),
                        (n) => `${plural(n)} em "${ACTIVITY_STATUS_LABEL[s]}"`
                      )
                    }
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface-2"
                  >
                    <span className={`h-2 w-2 rounded-full ${DOT[s]}`} aria-hidden />
                    {ACTIVITY_STATUS_LABEL[s]}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* prazo */}
        <div className="relative">
          <button
            type="button"
            disabled={pending}
            onClick={() => setMenu(menu === "prazo" ? null : "prazo")}
            aria-expanded={menu === "prazo"}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <CalendarDays className="h-4 w-4 text-gold-2" aria-hidden /> Prazo <ChevronDown className="h-3.5 w-3.5 text-white/50" aria-hidden />
          </button>
          {menu === "prazo" && (
            <div className="absolute bottom-full left-0 mb-2 w-60 animate-enter rounded-xl border border-border bg-surface p-3 text-foreground shadow-lg">
              <label htmlFor="bulk-prazo" className="ui-label">
                Novo prazo
              </label>
              <input id="bulk-prazo" type="date" value={data} onChange={(e) => setData(e.target.value)} className="ui-input" />
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => rodar(() => bulkUpdateDeadlineAction(ids, null), (n) => `Prazo removido de ${plural(n)}`)}
                  className="text-xs font-medium text-muted hover:text-foreground hover:underline"
                >
                  Tirar prazo
                </button>
                <button
                  type="button"
                  disabled={!data}
                  onClick={() =>
                    rodar(
                      () => bulkUpdateDeadlineAction(ids, data),
                      (n) => `Prazo de ${plural(n)} mudado para ${data.split("-").reverse().join("/")}`
                    )
                  }
                  className="ui-btn px-3 py-1.5 text-xs"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* arquivar / desarquivar */}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            rodar(
              () => bulkArchiveActivitiesAction(ids, !arquivadas),
              (n) => `${plural(n)} ${arquivadas ? (n === 1 ? "voltou" : "voltaram") + " para a lista" : n === 1 ? "arquivada" : "arquivadas"}`
            )
          }
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {arquivadas ? <ArchiveRestore className="h-4 w-4 text-gold-2" aria-hidden /> : <Archive className="h-4 w-4 text-gold-2" aria-hidden />}
          {arquivadas ? "Desarquivar" : "Arquivar"}
        </button>

        {/* excluir */}
        {podeExcluir && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm(`Excluir ${plural(ids.length)}? Documentos anexados a elas vão para a Lixeira.`)) return;
            rodar(() => bulkDeleteActivitiesAction(ids), (n) => `${plural(n)} ${n === 1 ? "excluída" : "excluídas"}`);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-red-200 transition-colors hover:bg-status-danger hover:text-white disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden /> Excluir
        </button>
        )}

        <span className="mx-1 h-6 w-px bg-white/15" aria-hidden />
        {pending ? (
          <span className="flex h-9 w-9 items-center justify-center" role="status" aria-label="Aplicando">
            <Loader2 className="h-4 w-4 animate-spin text-white/70" />
          </span>
        ) : (
          <button type="button" onClick={onLimpar} aria-label="Limpar seleção" data-tip="Limpar seleção" className="flex h-9 w-9 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
