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

const ETIQUETA: Record<string, { texto: string; cor: string } | undefined> = {
  agora: { texto: "Agora", cor: "bg-status-info-bg text-status-info" },
  atrasado: { texto: "Atrasado", cor: "bg-status-danger-bg text-status-danger" },
};
const hora = (t?: string | null) => (t ? t.slice(0, 5) : null);
const horaFeito = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" }) : null;

/** Rotina do dia em ordem de horário. Cada item marcado vale 1 ponto no ranking. */
export function MinhaRotina({
  itens: inicial,
  podeMarcar,
  titulo = "Minha rotina de hoje",
  compacto = false,
  linkTela = true,
}: {
  itens: ItemRotinaTela[];
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

  if (!itens.length) return null;
  return (
    <section className={compacto ? "" : "ui-card p-5"}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" aria-hidden /> Rotina · +1 ponto por item
          </p>
          <h2 className="section-title !text-lg">{titulo}</h2>
        </div>
        <span className={`numero-grande text-2xl ${feitos === itens.length ? "text-status-success" : "text-foreground"}`}>
          {feitos}/{itens.length}
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-track">
        <div className="h-full rounded-full bg-status-success transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-3 space-y-0.5">
        {itens.map((i) => {
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
      {linkTela && (
        <Link href="/admin/rotinas" className="eyebrow mt-3 inline-block hover:!text-foreground">
          Abrir rotinas ›
        </Link>
      )}
    </section>
  );
}
