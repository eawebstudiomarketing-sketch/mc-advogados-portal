"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { criarEtiquetaAction, setEtiquetasAction } from "@/app/admin/activities/etiquetas-actions";
import type { Etiqueta } from "@/lib/data/etiquetas";

/** Selo colorido de uma etiqueta (cor vem do cadastro; o tom se ajusta ao tema). */
export function EtiquetaChip({ e, onTirar, pequena = false }: { e: Etiqueta; onTirar?: () => void; pequena?: boolean }) {
  return (
    <span
      className={`etiqueta inline-flex max-w-full items-center gap-1 rounded-full font-semibold ${pequena ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
      style={{ "--et": e.cor } as React.CSSProperties}
      title={e.nome}
    >
      <span className="truncate">{e.nome}</span>
      {onTirar && (
        <button type="button" onClick={onTirar} className="-mr-0.5 rounded-full p-px opacity-70 hover:opacity-100" aria-label={`Tirar ${e.nome}`}>
          <X className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

/** Só os selos (listas, cartões). */
export function EtiquetasLinha({ ids, todas, pequena = true, max = 3 }: { ids: string[]; todas: Etiqueta[]; pequena?: boolean; max?: number }) {
  const lista = ids.map((id) => todas.find((e) => e.id === id)).filter((e): e is Etiqueta => !!e);
  if (!lista.length) return null;
  return (
    <span className="inline-flex max-w-full flex-wrap gap-1">
      {lista.slice(0, max).map((e) => (
        <EtiquetaChip key={e.id} e={e} pequena={pequena} />
      ))}
      {lista.length > max && <span className="text-[10px] text-muted">+{lista.length - max}</span>}
    </span>
  );
}

/**
 * Escolher etiquetas. Com `activityId`, salva na hora (mini tela da atividade);
 * sem, vai no formulário como campos "etiquetas".
 */
export function EtiquetasEditor({
  todas: inicial,
  defaultValue = [],
  activityId,
  name = "etiquetas",
  onMudou,
}: {
  todas: Etiqueta[];
  defaultValue?: string[];
  activityId?: string;
  name?: string;
  onMudou?: (ids: string[]) => void;
}) {
  const [todas, setTodas] = useState(inicial);
  const [sel, setSel] = useState<string[]>(defaultValue);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [pending, start] = useTransition();
  const porId = useMemo(() => new Map(todas.map((e) => [e.id, e])), [todas]);
  const termo = busca.trim().toLowerCase();
  const opcoes = todas.filter((e) => !sel.includes(e.id) && e.nome.toLowerCase().includes(termo));
  const podeCriar = !!termo && !todas.some((e) => e.nome.toLowerCase() === termo);

  function aplicar(novos: string[]) {
    const antes = sel;
    setSel(novos);
    onMudou?.(novos);
    if (!activityId) return;
    start(async () => {
      const r = await setEtiquetasAction(activityId, novos);
      if (!r.ok) {
        setSel(antes);
        onMudou?.(antes);
        toast.error(r.error ?? "Não foi possível salvar.");
      }
    });
  }

  function criar() {
    start(async () => {
      const r = await criarEtiquetaAction(busca);
      if (!r.ok) return void toast.error(r.error);
      setTodas((t) => (t.some((e) => e.id === r.etiqueta.id) ? t : [...t, r.etiqueta].sort((a, b) => a.nome.localeCompare(b.nome))));
      setBusca("");
      aplicar([...sel, r.etiqueta.id]);
    });
  }

  return (
    <div>
      {!activityId && (
        <>
          <input type="hidden" name={`${name}_presente`} value="1" />
          {sel.map((id) => (
            <input key={id} type="hidden" name={name} value={id} />
          ))}
        </>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {sel.map((id) => {
          const e = porId.get(id);
          return e ? <EtiquetaChip key={id} e={e} onTirar={() => aplicar(sel.filter((x) => x !== id))} /> : null;
        })}
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 py-0.5 text-[11px] text-foreground/70 hover:border-navy-3 hover:text-foreground"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />} Etiqueta
        </button>
      </div>
      {aberto && (
        <div className="mt-2 rounded-xl border border-border bg-surface p-2 shadow-md">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (opcoes[0] && !podeCriar) aplicar([...sel, opcoes[0].id]);
                else if (podeCriar) criar();
              }
            }}
            placeholder="Buscar ou criar etiqueta"
            aria-label="Buscar ou criar etiqueta"
            className="ui-input !py-1.5 text-sm"
            autoFocus
          />
          <ul className="mt-1 max-h-56 overflow-y-auto">
            {podeCriar && (
              <li>
                <button type="button" onClick={criar} disabled={pending} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                  <Plus className="h-3.5 w-3.5 text-navy-3" aria-hidden /> Criar &ldquo;{busca.trim()}&rdquo;
                </button>
              </li>
            )}
            {opcoes.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => aplicar([...sel, e.id])} className="flex w-full items-center rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
                  <EtiquetaChip e={e} />
                </button>
              </li>
            ))}
            {!opcoes.length && !podeCriar && <li className="px-2 py-2 text-xs text-muted">Nenhuma etiqueta.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
