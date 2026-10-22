"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Save } from "lucide-react";
import { saveHandoffAction, type SaveHandoffState } from "../../actions";
import { secoesHandoff, type HandoffAnswers, type HandoffField, type TipoPessoa } from "@/lib/handoff-schema";

const initialState: SaveHandoffState = { error: null, savedAt: null };

const vazio = (v: unknown) => v == null || (Array.isArray(v) ? v.length === 0 : String(v).trim() === "");

export function HandoffForm({ clientId, inicial, tipo = "PJ" }: { clientId: string; inicial: HandoffAnswers; tipo?: TipoPessoa }) {
  const HANDOFF_SECTIONS = secoesHandoff(tipo);
  const [state, formAction, pending] = useActionState(saveHandoffAction, initialState);
  const [v, setV] = useState<HandoffAnswers>(inicial);
  const [alterado, setAlterado] = useState(false);
  const [atual, setAtual] = useState(HANDOFF_SECTIONS[0].id);
  const refs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    if (state.savedAt) toast.success("Ficha de handoff salva");
  }, [state.savedAt]);
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  const [vistoEm, setVistoEm] = useState<string | null>(null);
  if (state.savedAt && state.savedAt !== vistoEm) {
    setVistoEm(state.savedAt);
    setAlterado(false);
  }

  useEffect(() => {
    const obs = new IntersectionObserver(
      (es) => {
        const vis = es.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setAtual(vis.target.id.replace("sec-", ""));
      },
      { rootMargin: "-120px 0px -60% 0px" }
    );
    Object.values(refs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  function set(id: string, valor: string | string[]) {
    setV((x) => ({ ...x, [id]: valor }));
    setAlterado(true);
  }
  function alternar(id: string, opcao: string) {
    const lista = (v[id] as string[] | undefined) ?? [];
    set(id, lista.includes(opcao) ? lista.filter((o) => o !== opcao) : [...lista, opcao]);
  }

  const secaoFeita = (s: ReturnType<typeof secoesHandoff>[number]) => s.fields.some((f) => !vazio(v[f.id]));

  function campo(f: HandoffField) {
    const valor = v[f.id];
    switch (f.type) {
      case "textarea":
        return (
          <div key={f.id} className="sm:col-span-2">
            <label htmlFor={f.id} className="ui-label">
              {f.label}
              {f.hint && <span className="ml-1 font-normal text-muted">· {f.hint}</span>}
            </label>
            <textarea id={f.id} rows={f.rows ?? 3} value={(valor as string) ?? ""} onChange={(e) => set(f.id, e.target.value)} className="ui-input leading-relaxed" />
          </div>
        );
      case "multi": {
        const lista = (valor as string[] | undefined) ?? [];
        return (
          <div key={f.id} className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {f.options.map((o) => {
                const on = lista.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    onClick={() => alternar(f.id, o)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors duration-150 ${
                      on ? "border-navy bg-navy text-white" : "border-border-strong bg-surface text-foreground hover:border-navy-3/50 hover:bg-surface-2"
                    }`}
                  >
                    {on && <Check className="h-3.5 w-3.5 text-gold-2" aria-hidden />}
                    {o}
                  </button>
                );
              })}
            </div>
            {f.outro && (
              <input
                value={(v[`${f.id}_outro`] as string) ?? ""}
                onChange={(e) => set(`${f.id}_outro`, e.target.value)}
                placeholder="Outro (opcional)"
                aria-label={`${f.label}: outro`}
                className="ui-input mt-3 max-w-md"
              />
            )}
          </div>
        );
      }
      case "single":
      case "yesno": {
        const opcoes = f.type === "yesno" ? ["Sim", "Não"] : f.options;
        return (
          <div key={f.id} className="sm:col-span-2">
            <p className="ui-label">{f.label}</p>
            <div role="radiogroup" aria-label={f.label} className="inline-flex flex-wrap gap-0.5 rounded-xl bg-track p-1">
              {opcoes.map((o) => {
                const on = valor === o;
                return (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set(f.id, on ? "" : o)}
                    className={`rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-150 ${
                      on ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
            {f.type === "yesno" && f.detalhe && valor === "Sim" && (
              <div className="mt-3 animate-enter">
                <label htmlFor={f.detalhe.id} className="ui-label">
                  {f.detalhe.label}
                </label>
                <textarea
                  id={f.detalhe.id}
                  rows={3}
                  value={(v[f.detalhe.id] as string) ?? ""}
                  onChange={(e) => set(f.detalhe!.id, e.target.value)}
                  className="ui-input leading-relaxed"
                />
              </div>
            )}
          </div>
        );
      }
      default:
        return (
          <div key={f.id} className={f.half ? "" : "sm:col-span-2"}>
            <label htmlFor={f.id} className="ui-label">
              {f.label}
            </label>
            <div className="relative">
              {f.type === "money" && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">R$</span>}
              <input
                id={f.id}
                type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                inputMode={f.type === "money" ? "decimal" : undefined}
                min={f.type === "number" ? 0 : undefined}
                value={(valor as string) ?? ""}
                onChange={(e) => set(f.id, e.target.value)}
                placeholder={f.type === "money" ? "0,00" : undefined}
                className={`ui-input ${f.type === "money" ? "pl-9" : ""}`}
              />
            </div>
          </div>
        );
    }
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="handoff" value={JSON.stringify(v)} />

      {/* índice das seções */}
      <nav aria-label="Seções da ficha" className="hidden lg:block">
        <ol className="sticky top-8 space-y-0.5">
          {HANDOFF_SECTIONS.map((s) => {
            const on = atual === s.id;
            const feita = secaoFeita(s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => refs.current[s.id]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                    on ? "bg-surface font-medium text-foreground shadow-sm" : "text-muted hover:text-foreground"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold tabular-nums ${
                      feita ? "bg-navy text-gold-2" : "bg-track text-muted"
                    }`}
                  >
                    {feita ? <Check className="h-3 w-3" aria-hidden /> : s.numero}
                  </span>
                  <span className="truncate">{s.titulo}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="space-y-4">
        {HANDOFF_SECTIONS.map((s) => (
          <section
            key={s.id}
            id={`sec-${s.id}`}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            className="ui-card scroll-mt-6 p-5 sm:p-6"
          >
            <header className="mb-4 flex items-baseline gap-3">
              <span className="text-sm font-semibold tabular-nums text-gold">{String(s.numero).padStart(2, "0")}</span>
              <div>
                <h2 className="text-[15px] font-semibold text-foreground">{s.titulo}</h2>
                {s.descricao && <p className="text-[13px] text-muted">{s.descricao}</p>}
              </div>
            </header>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{s.fields.map(campo)}</div>
          </section>
        ))}

        <div className="sticky bottom-3 z-10 flex items-center justify-end gap-3 rounded-2xl border border-border bg-surface/90 px-4 py-3 shadow-lg backdrop-blur">
          <span className="mr-auto text-[13px] text-muted">{alterado ? "Alterações não salvas" : state.savedAt ? "Tudo salvo" : ""}</span>
          <Link href={`/admin/clients/${clientId}`} className="ui-btn-secondary">
            Voltar ao cliente
          </Link>
          <button type="submit" disabled={pending} className="ui-btn">
            <Save className="h-4 w-4" aria-hidden />
            {pending ? "Salvando..." : "Salvar ficha"}
          </button>
        </div>
      </div>
    </form>
  );
}
