"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { marcarRotinaAction, marcarSubitemRotinaAction } from "@/app/admin/rotina/actions";
import { descreverRepeticao, type RegraMensal, type SubitemRotina } from "@/lib/rotina-repeticao";

export type ItemRotinaTela = {
  id: string;
  titulo: string;
  feito: boolean;
  feitoEm?: string | null;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  observacao?: string | null;
  situacao?: "feito" | "agora" | "atrasado" | "depois" | "sem_hora";
  /** checklist da tarefa fixa (03/11) e os subitens já marcados hoje */
  checklist?: SubitemRotina[];
  subFeitos?: string[];
};

/** Item da rotina que não cai hoje (só para mostrar a semana). */
export type ItemOutroDia = { id: string; titulo: string; dias: number[]; hora_inicio?: string | null; hora_fim?: string | null; repeticao?: "semanal" | "mensal"; regra_mensal?: RegraMensal | null };

const ETIQUETA: Record<string, { texto: string; cor: string } | undefined> = {
  agora: { texto: "Agora", cor: "bg-status-info-bg text-status-info" },
  atrasado: { texto: "Atrasado", cor: "bg-status-danger-bg text-status-danger" },
};
const hora = (t?: string | null) => (t ? t.slice(0, 5) : null);
const horaFeito = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" }) : null;

/** Agrupa as tarefas do dia em Manhã (antes das 12h), Tarde e as sem horário. */
function gruposDoDia(itens: ItemRotinaTela[]): [string, ItemRotinaTela[]][] {
  const h = (i: ItemRotinaTela) => i.hora_inicio?.slice(0, 5) ?? null;
  const grupos: [string, ItemRotinaTela[]][] = [
    ["Manhã", itens.filter((i) => h(i) && h(i)! < "12:00")],
    ["Tarde", itens.filter((i) => h(i) && h(i)! >= "12:00")],
    ["Durante o dia", itens.filter((i) => !h(i))],
  ];
  return grupos.filter(([, lista]) => lista.length > 0);
}

/** Rotina do dia na ordem de prioridade. (Desde 12/11/2026 a rotina não pontua no ranking.) */
export function MinhaRotina({
  itens: inicial,
  podeMarcar,
  titulo = "Minha rotina de hoje",
  compacto = false,
  linkTela = true,
  outrosDias = [],
  pequeno = false,
}: {
  itens: ItemRotinaTela[];
  outrosDias?: ItemOutroDia[];
  podeMarcar: boolean;
  titulo?: string;
  compacto?: boolean;
  linkTela?: boolean;
  /** Cartão estreito de checklist (coluna da direita da Área de trabalho, 30/10/2026). */
  pequeno?: boolean;
}) {
  const [itens, setItens] = useState(inicial);
  const [aberto, setAberto] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const feitos = itens.filter((i) => i.feito).length;
  const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0;

  function alternar(i: ItemRotinaTela) {
    if (!podeMarcar) return;
    const novo = !i.feito;
    const quando = novo ? new Date().toISOString() : null;
    setItens((xs) => xs.map((x) => (x.id === i.id ? { ...x, feito: novo, feitoEm: quando, situacao: novo ? "feito" : x.situacao === "feito" ? "sem_hora" : x.situacao } : x)));
    start(async () => {
      const r = await marcarRotinaAction(i.id, novo);
      if (!r.ok) {
        setItens((xs) => xs.map((x) => (x.id === i.id ? i : x)));
        toast.error(r.erro ?? "Não foi possível salvar.");
      } else {
        if (novo && feitos + 1 === itens.length) toast.success("Rotina do dia completa! 🎉");
        router.refresh(); // ranking e situação ("atrasado") se acertam
      }
    });
  }

  /** Subitem do checklist da tarefa: marcando todos, a tarefa se marca sozinha. */
  function alternarSub(i: ItemRotinaTela, subId: string) {
    if (!podeMarcar) return;
    const antes = i.subFeitos ?? [];
    const novo = !antes.includes(subId);
    const subFeitos = novo ? [...antes, subId] : antes.filter((x) => x !== subId);
    const completo = novo && (i.checklist ?? []).every((x) => subFeitos.includes(x.id));
    setItens((xs) => xs.map((x) => (x.id === i.id ? { ...x, subFeitos, ...(completo ? { feito: true, feitoEm: new Date().toISOString(), situacao: "feito" as const } : {}) } : x)));
    start(async () => {
      const r = await marcarSubitemRotinaAction(i.id, subId, novo);
      if (!r.ok) {
        setItens((xs) => xs.map((x) => (x.id === i.id ? i : x)));
        toast.error(r.erro ?? "Não foi possível salvar.");
      } else {
        if (r.itemFeito && !i.feito) toast.success(`“${i.titulo}” concluída.`);
        router.refresh();
      }
    });
  }

  if (!itens.length && !outrosDias.length) return null;
  if (pequeno) {
    // pendentes primeiro (em ordem de horário), feitos no fim
    const ordem = [...itens].sort((a, b) => Number(a.feito) - Number(b.feito));
    return (
      <section className="ui-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="eyebrow flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" aria-hidden /> Minha rotina
          </p>
          {itens.length > 0 && (
            <span className={`text-sm font-semibold tabular-nums ${feitos === itens.length ? "text-status-success" : "text-foreground"}`}>
              {feitos}/{itens.length}
            </span>
          )}
        </div>
        {itens.length > 0 ? (
          <>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-track">
              <div className="h-full rounded-full bg-status-success transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
            <ul className="mt-2 max-h-72 space-y-px overflow-y-auto">
              {ordem.map((i) => {
                const etq = !i.feito ? ETIQUETA[i.situacao ?? ""] : undefined;
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => alternar(i)}
                      disabled={!podeMarcar}
                      aria-pressed={i.feito}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-hover ${podeMarcar ? "" : "cursor-default"}`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                          i.feito ? "border-status-success bg-status-success text-white" : etq?.texto === "Atrasado" ? "border-status-danger" : "border-border-strong"
                        }`}
                        aria-hidden
                      >
                        {i.feito && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-[13px] ${i.feito ? "text-muted line-through" : "text-foreground"}`} title={i.titulo}>
                        {i.titulo}
                      </span>
                      {!!i.checklist?.length && (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted" title="Subitens do checklist">
                          {(i.subFeitos ?? []).filter((x) => i.checklist!.some((c) => c.id === x)).length}/{i.checklist.length}
                        </span>
                      )}
                      {hora(i.hora_inicio) && <span className={`shrink-0 text-[11px] tabular-nums ${etq ? (etq.texto === "Atrasado" ? "text-status-danger" : "text-status-info") : "text-muted"}`}>{hora(i.hora_inicio)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted">Nada da sua rotina para hoje.</p>
        )}
        {linkTela && (
          <Link href="/admin/rotinas" className="eyebrow mt-2 inline-block hover:!text-foreground">
            Abrir rotinas ›
          </Link>
        )}
      </section>
    );
  }
  return (
    <section className={compacto ? "" : "ui-card p-5"}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" aria-hidden /> Rotina do dia
          </p>
          <h2 className="section-title !text-lg">{titulo}</h2>
        </div>
        {itens.length > 0 && (
          <span className={`numero-grande text-2xl ${feitos === itens.length ? "text-status-success" : "text-foreground"}`}>
            {feitos}/{itens.length}
          </span>
        )}
      </div>
      {itens.length > 0 ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
          <div className="h-full rounded-full bg-status-success transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Nada da sua rotina para hoje.</p>
      )}
      {gruposDoDia(itens).map(([rotuloGrupo, lista]) => (
      <div key={rotuloGrupo} className="mt-3">
      <p className="eyebrow mb-1">{rotuloGrupo}</p>
      <ul className="space-y-0.5">
        {lista.map((i) => {
          const ini = hora(i.hora_inicio);
          const fim = hora(i.hora_fim);
          const etq = !i.feito ? ETIQUETA[i.situacao ?? ""] : undefined;
          return (
            <li key={i.id} className={`rounded-xl ${i.situacao === "agora" && !i.feito ? "bg-status-info-bg/60" : ""}`}>
              <div className="flex items-start gap-3 px-2 py-2">
                <span className="numero-grande w-12 shrink-0 pt-0.5 text-right text-sm text-foreground/70">
                  {ini ?? "—"}
                  {fim && <span className="block text-[11px] font-normal text-muted">{fim}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => alternar(i)}
                  disabled={!podeMarcar}
                  aria-pressed={i.feito}
                  aria-label={`${i.feito ? "Desmarcar" : "Marcar"} ${i.titulo}`}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                    i.feito ? "border-status-success bg-status-success text-white" : "border-border-strong hover:border-status-success"
                  } ${podeMarcar ? "" : "cursor-default"}`}
                >
                  {i.feito && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                </button>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm ${i.feito ? "text-muted line-through" : "text-foreground"}`}>{i.titulo}</span>
                    {etq && <span className={`rounded-full px-2 py-px text-[10px] font-semibold ${etq.cor}`}>{etq.texto}</span>}
                    {i.feito && i.feitoEm && <span className="text-[11px] text-status-success">feito às {horaFeito(i.feitoEm)}</span>}
                    {!!i.checklist?.length && (
                      <span className="text-[11px] tabular-nums text-muted">
                        {(i.subFeitos ?? []).filter((x) => i.checklist!.some((c) => c.id === x)).length}/{i.checklist.length} subitens
                      </span>
                    )}
                  </span>
                  {!!i.checklist?.length && (
                    <ul className="mt-1.5 space-y-0.5 border-l-2 border-border pl-2.5" aria-label={`Checklist de ${i.titulo}`}>
                      {i.checklist.map((c) => {
                        const ok = (i.subFeitos ?? []).includes(c.id);
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => alternarSub(i, c.id)}
                              disabled={!podeMarcar}
                              aria-pressed={ok}
                              className={`flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-hover ${podeMarcar ? "" : "cursor-default"}`}
                            >
                              <span
                                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors ${ok ? "border-status-success bg-status-success text-white" : "border-border-strong"}`}
                                aria-hidden
                              >
                                {ok && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                              </span>
                              <span className={`text-xs ${ok ? "text-muted line-through" : "text-foreground/85"}`}>{c.texto}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {i.observacao && (
                    <button type="button" onClick={() => setAberto(aberto === i.id ? null : i.id)} className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground">
                      <ChevronDown className={`h-3 w-3 transition-transform ${aberto === i.id ? "rotate-180" : ""}`} aria-hidden /> Como fazer
                    </button>
                  )}
                  {aberto === i.id && i.observacao && <p className="mt-1 text-xs whitespace-pre-wrap text-foreground/75">{i.observacao}</p>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      </div>
      ))}
      {outrosDias.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="eyebrow mb-1">Em outros dias</p>
          <ul className="space-y-0.5">
            {outrosDias.map((i) => (
              <li key={i.id} className="flex items-baseline gap-3 px-2 py-1 text-sm">
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{hora(i.hora_inicio) ?? "—"}</span>
                <span className="min-w-0 flex-1 text-foreground/75">{i.titulo}</span>
                <span className="shrink-0 text-[11px] text-muted">{descreverRepeticao({ repeticao: i.repeticao ?? "semanal", dias: i.dias, regra_mensal: i.regra_mensal ?? null })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {linkTela && (
        <Link href="/admin/rotinas" className="eyebrow mt-3 inline-block hover:!text-foreground">
          Abrir rotinas ›
        </Link>
      )}
    </section>
  );
}
