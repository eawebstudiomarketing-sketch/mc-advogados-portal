"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronDown, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { marcarRotinaAction } from "@/app/admin/rotina/actions";

export type ItemRotinaTela = {
  id: string;
  titulo: string;
  feito: boolean;
  feitoEm?: string | null;
  hora_inicio?: string | null;
  hora_fim?: string | null;
  observacao?: string | null;
  situacao?: "feito" | "agora" | "atrasado" | "depois" | "sem_hora";
};

/** Item da rotina que não cai hoje (só para mostrar a semana). */
export type ItemOutroDia = { id: string; titulo: string; dias: number[]; hora_inicio?: string | null; hora_fim?: string | null };

const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const nomeDosDias = (dias: number[]) => (dias.length === 7 ? "Todo dia" : [...dias].sort().map((d) => DIA_CURTO[d]).join(", "));

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

/** Rotina do dia em ordem de horário. Cada item marcado vale 1 ponto no ranking. */
export function MinhaRotina({
  itens: inicial,
  podeMarcar,
  titulo = "Minha rotina de hoje",
  compacto = false,
  linkTela = true,
  outrosDias = [],
}: {
  itens: ItemRotinaTela[];
  outrosDias?: ItemOutroDia[];
  podeMarcar: boolean;
  titulo?: string;
  compacto?: boolean;
  linkTela?: boolean;
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

  if (!itens.length && !outrosDias.length) return null;
  return (
    <section className={compacto ? "" : "ui-card p-5"}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" aria-hidden /> Rotina · +1 ponto por item
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
                  </span>
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
          <p className="eyebrow mb-1">Nos outros dias</p>
          <ul className="space-y-0.5">
            {outrosDias.map((i) => (
              <li key={i.id} className="flex items-baseline gap-3 px-2 py-1 text-sm">
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{hora(i.hora_inicio) ?? "—"}</span>
                <span className="min-w-0 flex-1 text-foreground/75">{i.titulo}</span>
                <span className="shrink-0 text-[11px] text-muted">{nomeDosDias(i.dias)}</span>
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
