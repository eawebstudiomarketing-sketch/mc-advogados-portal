"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { salvarRegrasAction } from "./relatorio-actions";
import { DIAS_SEMANA, type AvisarAtraso, type RegrasRotina } from "@/lib/rotina-relatorio/regras-base";

// Regras da rotina (06/11/2026, só o admin máximo): o que antes era fixo no
// código. Salvar vale na hora para todo o portal (relógio, faixa do topo,
// envio do relatório, avisos de atraso).

const AVISAR: { valor: AvisarAtraso; rotulo: string }[] = [
  { valor: "ambos", rotulo: "Portal e WhatsApp" },
  { valor: "portal", rotulo: "Só no portal" },
  { valor: "zap", rotulo: "Só no WhatsApp" },
  { valor: "nenhum", rotulo: "Não avisar" },
];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

function Linha({ titulo, ajuda, children }: { titulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-b border-border py-4 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
      <div>
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        {ajuda && <p className="mt-0.5 text-xs text-muted">{ajuda}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function EditorRegras({ regras, agendaZap: agendaInicial, pessoas }: { regras: RegrasRotina; agendaZap: boolean; pessoas: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [r, setR] = useState(regras);
  const [agendaZap, setAgendaZap] = useState(agendaInicial);
  const [novaPessoa, setNovaPessoa] = useState("");
  const [novoHorario, setNovoHorario] = useState("17:00");
  const mudar = (parte: Partial<RegrasRotina>) => setR((x) => ({ ...x, ...parte }));
  const nomeDe = (id: string) => pessoas.find((p) => p.id === id)?.nome ?? "(pessoa removida)";
  const semExcecao = pessoas.filter((p) => !(p.id in r.excecoes));

  function salvar() {
    start(async () => {
      const res = await salvarRegrasAction(r, agendaZap);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Regras salvas. Já valem para a equipe.");
      router.refresh();
    });
  }

  return (
    <div>
      <section aria-label="Relatório do dia">
        <h3 className="section-title">Relatório do dia</h3>
        <Linha titulo="Horário limite da equipe" ajuda="Até que horas a equipe envia o relatório do dia.">
          <input type="time" value={r.prazo} onChange={(e) => e.target.value && mudar({ prazo: e.target.value })} aria-label="Horário limite da equipe" className="ui-input !w-[7.5rem]" />
        </Linha>
        <Linha titulo="Horário diferente para alguém" ajuda="Exceção: a pessoa tem outro horário limite.">
          <div className="w-full space-y-2 sm:w-auto">
            {Object.entries(r.excecoes).map(([id, h]) => (
              <div key={id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground sm:w-44 sm:flex-none">{nomeDe(id)}</span>
                <input type="time" value={h} onChange={(e) => e.target.value && mudar({ excecoes: { ...r.excecoes, [id]: e.target.value } })} aria-label={`Horário de ${nomeDe(id)}`} className="ui-input !w-[7.5rem]" />
                <button
                  type="button"
                  onClick={() => {
                    const resto = { ...r.excecoes };
                    delete resto[id];
                    mudar({ excecoes: resto });
                  }}
                  aria-label={`Tirar a exceção de ${nomeDe(id)}`}
                  className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            {semExcecao.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <select value={novaPessoa} onChange={(e) => setNovaPessoa(e.target.value)} aria-label="Pessoa" className="ui-input !w-auto min-w-0 flex-1 sm:w-44 sm:flex-none">
                  <option value="">Escolha a pessoa</option>
                  {semExcecao.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <input type="time" value={novoHorario} onChange={(e) => setNovoHorario(e.target.value)} aria-label="Horário da exceção" className="ui-input !w-[7.5rem]" />
                <button
                  type="button"
                  disabled={!novaPessoa || !novoHorario}
                  onClick={() => {
                    mudar({ excecoes: { ...r.excecoes, [novaPessoa]: novoHorario } });
                    setNovaPessoa("");
                  }}
                  className="ui-btn-secondary px-3 py-1.5 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Pôr
                </button>
              </div>
            )}
          </div>
        </Linha>
        <Linha titulo="Depois do horário limite" ajuda="Aceitar com atraso deixa enviar até 23:59, marcado como atrasado.">
          <select value={r.depoisDoPrazo} onChange={(e) => mudar({ depoisDoPrazo: e.target.value as RegrasRotina["depoisDoPrazo"] })} aria-label="Depois do horário limite" className="ui-input !w-auto">
            <option value="aceita">Aceita até 23:59, com atraso</option>
            <option value="fecha">Fecha: não aceita mais</option>
          </select>
        </Linha>
        <Linha titulo="Dias com relatório" ajuda="Nos outros dias ninguém precisa enviar.">
          {ORDEM_DIAS.map((d) => {
            const marcado = r.dias.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={marcado}
                onClick={() => mudar({ dias: marcado ? r.dias.filter((x) => x !== d) : [...r.dias, d].sort() })}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${marcado ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-border text-muted hover:bg-hover"}`}
              >
                {DIAS_SEMANA[d]}
              </button>
            );
          })}
          <label className="ml-1 inline-flex items-center gap-1.5 text-sm text-foreground">
            <input type="checkbox" checked={r.pularFeriados} onChange={(e) => mudar({ pularFeriados: e.target.checked })} className="h-4 w-4 accent-[var(--navy)]" /> Sem relatório em feriado
          </label>
        </Linha>
      </section>

      <section aria-label="Avisos" className="mt-6">
        <h3 className="section-title">Avisos</h3>
        <Linha titulo="Faixa fixa no topo da tela" ajuda="Quanto tempo antes do limite aparece o aviso com o que falta. 0 = sem faixa.">
          <input type="number" min={0} max={240} step={5} value={r.avisoTopoMin} onChange={(e) => mudar({ avisoTopoMin: Number(e.target.value) })} aria-label="Minutos antes (faixa)" className="ui-input !w-24" />
          <span className="text-sm text-muted">min antes</span>
        </Linha>
        <Linha titulo="Relógio do alto fica vermelho" ajuda="Quanto tempo antes do limite, se o relatório não foi enviado.">
          <input type="number" min={0} max={600} step={15} value={r.relogioVermelhoMin} onChange={(e) => mudar({ relogioVermelhoMin: Number(e.target.value) })} aria-label="Minutos antes (relógio)" className="ui-input !w-24" />
          <span className="text-sm text-muted">min antes</span>
        </Linha>
        <Linha titulo="Quando alguém envia com atraso, avisar você" ajuda="Vale só se o relatório aceita envio depois do limite.">
          <select value={r.avisarAtraso} onChange={(e) => mudar({ avisarAtraso: e.target.value as AvisarAtraso })} aria-label="Como avisar o atraso" className="ui-input !w-auto">
            {AVISAR.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.rotulo}
              </option>
            ))}
          </select>
        </Linha>
      </section>

      <section aria-label="WhatsApp" className="mt-6">
        <h3 className="section-title">WhatsApp</h3>
        <Linha titulo="Agenda do dia às 8h para a equipe" ajuda="Cada pessoa recebe a rotina e as atividades do dia.">
          <label className="inline-flex items-center gap-1.5 text-sm text-foreground">
            <input type="checkbox" checked={agendaZap} onChange={(e) => setAgendaZap(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" /> Ligada
          </label>
        </Linha>
        <Linha titulo="Resumo do fim do dia para você" ajuda="Arquivo com as rotinas e relatórios de todos, à meia-noite e quando você envia o seu.">
          <label className="inline-flex items-center gap-1.5 text-sm text-foreground">
            <input type="checkbox" checked={r.resumoFimDoDiaZap} onChange={(e) => mudar({ resumoFimDoDiaZap: e.target.checked })} className="h-4 w-4 accent-[var(--navy)]" /> Ligado
          </label>
        </Linha>
      </section>

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={salvar} disabled={pending} className="ui-btn">
          {pending ? "Salvando…" : "Salvar regras"}
        </button>
      </div>
    </div>
  );
}
