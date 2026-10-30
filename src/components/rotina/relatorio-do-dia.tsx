"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import { enviarRelatorioAction, salvarRascunhoAction } from "@/app/admin/rotinas/relatorio-actions";
import {
  chaveResposta,
  faltaParaEnviar,
  SECAO_ROTULO,
  SECOES,
  type DemandaVencida,
  type Pergunta,
  type PessoaEquipe,
  type Secao,
  type Valor,
} from "@/lib/rotina-relatorio/tipos";

// Relatório do dia (Rotinas v2): a pessoa responde as perguntas do modelo dela,
// justifica as demandas vencidas e envia, até as 23:59. As três seções ficam
// bem separadas (sobre você · sobre a equipe · sobre cada pessoa).

type PerguntaTela = Pick<Pergunta, "id" | "secao" | "texto" | "tipo" | "opcoes" | "obrigatoria">;

const vazio = (v: Valor | undefined) => v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

function Campo({ p, uid, valor, onChange, desabilitado }: { p: PerguntaTela; uid: string; valor: Valor | undefined; onChange: (v: Valor) => void; desabilitado: boolean }) {
  const id = `q-${uid}`;
  const base = "ui-input w-full text-sm";
  switch (p.tipo) {
    case "texto_curto":
      return <input aria-labelledby={`${id}-t`} value={(valor as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={desabilitado} maxLength={300} className={base} />;
    case "texto_longo":
      return <textarea aria-labelledby={`${id}-t`} value={(valor as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={desabilitado} rows={3} maxLength={4000} className={`${base} resize-y`} />;
    case "numero":
      return <input aria-labelledby={`${id}-t`} type="number" inputMode="decimal" value={valor === undefined ? "" : String(valor)} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} disabled={desabilitado} className={`${base} !w-40`} />;
    case "sim_nao":
    case "escolha":
    case "nota": {
      const opcoes = p.tipo === "sim_nao" ? ["Sim", "Não"] : p.tipo === "nota" ? Array.from({ length: 11 }, (_, i) => String(i)) : p.opcoes;
      return (
        <div role="radiogroup" aria-labelledby={`${id}-t`} className="flex flex-wrap gap-1.5">
          {opcoes.map((o) => {
            const on = String(valor ?? "") === o;
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={desabilitado}
                onClick={() => onChange(o)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/80 hover:border-border-strong"}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    case "multipla": {
      const marcadas = Array.isArray(valor) ? valor : [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {p.opcoes.map((o) => {
            const on = marcadas.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                disabled={desabilitado}
                onClick={() => onChange(on ? marcadas.filter((x) => x !== o) : [...marcadas, o])}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/80 hover:border-border-strong"}`}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
  }
}

function Pergunta1({ p, uid, valor, onChange, desabilitado }: { p: PerguntaTela; uid: string; valor: Valor | undefined; onChange: (v: Valor) => void; desabilitado: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-foreground">
        <span id={`q-${uid}-t`}>{p.texto}</span>
        {p.obrigatoria && <span className="ml-1 text-status-danger" aria-label="obrigatória">*</span>}
      </p>
      <Campo p={p} uid={uid} valor={valor} onChange={onChange} desabilitado={desabilitado} />
    </div>
  );
}

const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });

export function RelatorioDoDia({
  perguntas,
  equipe,
  demandas,
  inicial,
}: {
  perguntas: PerguntaTela[];
  equipe: PessoaEquipe[];
  demandas: DemandaVencida[];
  inicial: { respostas: Record<string, Valor>; justificativas: Record<string, string>; enviadoEm: string | null };
}) {
  const [respostas, setRespostas] = useState(inicial.respostas);
  const [justificativas, setJustificativas] = useState(inicial.justificativas);
  const [enviadoEm, setEnviadoEm] = useState(inicial.enviadoEm);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const enviado = !!enviadoEm;
  const mudou = useRef(false);

  // rascunho salvo sozinho, um instante depois de parar de digitar
  useEffect(() => {
    if (!mudou.current || enviado) return;
    const t = setTimeout(async () => {
      const r = await salvarRascunhoAction(respostas, justificativas);
      if (r.ok) setSalvoEm(new Date().toISOString());
      else setErro(r.error);
    }, 1200);
    return () => clearTimeout(t);
  }, [respostas, justificativas, enviado]);

  const ativas = perguntas;
  const usaEquipe = ativas.some((p) => p.secao === "equipe_pessoa");
  const faltas = faltaParaEnviar({
    perguntas: ativas.map((p) => ({ ...p, ativa: true })),
    equipe: usaEquipe ? equipe : [],
    respostas,
    demandas,
    justificativas,
  });

  function responder(chave: string, v: Valor) {
    mudou.current = true;
    setErro(null);
    setRespostas((r) => ({ ...r, [chave]: v }));
  }
  function justificar(id: string, v: string) {
    mudou.current = true;
    setErro(null);
    setJustificativas((j) => ({ ...j, [id]: v }));
  }
  function enviar() {
    setErro(null);
    start(async () => {
      const r = await enviarRelatorioAction(respostas, justificativas);
      if (!r.ok) return setErro(r.error);
      setEnviadoEm(new Date().toISOString());
      toast.success("Relatório enviado.");
      router.refresh();
    });
  }

  const porSecao = (s: Secao) => ativas.filter((p) => p.secao === s);

  return (
    <section aria-label="Relatório do dia" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="section-title">Relatório do dia</h2>
          <p className="mt-0.5 text-sm text-muted">Responda até as 23:59 de hoje. {enviado ? "" : "O rascunho é salvo sozinho."}</p>
        </div>
        {enviado ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success-bg px-3 py-1 text-sm font-semibold text-status-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Enviado às {horaDe(enviadoEm!)}
          </span>
        ) : (
          salvoEm && <span className="text-xs text-muted">Rascunho salvo às {horaDe(salvoEm)}</span>
        )}
      </div>

      {demandas.length > 0 && (
        <div className="ui-card !border-status-danger/40 bg-status-danger-bg/30 p-4">
          <h3 className="text-sm font-semibold text-foreground">
            Demandas vencidas: justifique cada uma ({demandas.length})
          </h3>
          <p className="mt-0.5 mb-3 text-xs text-muted">Sem a justificativa de todas, o relatório não pode ser enviado.</p>
          <ul className="space-y-3">
            {demandas.map((d) => (
              <li key={d.id} className="space-y-1.5">
                <p className="text-sm font-medium text-foreground">
                  {d.titulo}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {d.cliente ?? "Sem cliente"} · venceu {d.prazo.split("-").reverse().slice(0, 2).join("/")}
                    {d.diasAtraso > 0 ? ` (${d.diasAtraso} ${d.diasAtraso === 1 ? "dia" : "dias"} de atraso)` : " (vence hoje)"}
                  </span>
                </p>
                <textarea
                  aria-label={`Justificativa: ${d.titulo}`}
                  value={justificativas[d.id] ?? ""}
                  onChange={(e) => justificar(d.id, e.target.value)}
                  disabled={enviado}
                  rows={2}
                  maxLength={1000}
                  placeholder="Por que não foi concluída?"
                  className="ui-input w-full resize-y text-sm"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {SECOES.map((s) => {
        const lista = porSecao(s);
        if (!lista.length) return null;
        return (
          <div key={s} className="ui-card p-4 sm:p-5">
            <h3 className="eyebrow">{SECAO_ROTULO[s].titulo}</h3>
            <p className="mt-0.5 mb-4 text-xs text-muted">{SECAO_ROTULO[s].ajuda}</p>
            {s === "equipe_pessoa" ? (
              equipe.length === 0 ? (
                <p className="text-sm text-muted">Não há outras pessoas na equipe.</p>
              ) : (
                <div className="space-y-4">
                  {equipe.map((pessoa) => (
                    <fieldset key={pessoa.id} className="rounded-xl border border-border p-3.5">
                      <legend className="px-1.5 text-sm font-semibold text-foreground">{pessoa.nome}</legend>
                      <div className="space-y-3.5">
                        {lista.map((p) => (
                          <Pergunta1 key={p.id} p={p} uid={chaveResposta(p.id, pessoa.id).replace(":", "-")} valor={respostas[chaveResposta(p.id, pessoa.id)]} onChange={(v) => responder(chaveResposta(p.id, pessoa.id), v)} desabilitado={enviado} />
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              )
            ) : (
              <div className="space-y-4">
                {lista.map((p) => (
                  <Pergunta1 key={p.id} p={p} uid={p.id} valor={respostas[chaveResposta(p.id)]} onChange={(v) => responder(chaveResposta(p.id), v)} desabilitado={enviado} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {!enviado && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={enviar} disabled={pending || faltas.length > 0} className="ui-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm">
            <Send className="h-4 w-4" aria-hidden /> {pending ? "Enviando…" : "Enviar relatório"}
          </button>
          {faltas.length > 0 && <p className="text-sm text-status-pending">Falta: {faltas.join(" · ")}.</p>}
          {erro && <p className="text-sm text-status-danger">{erro}</p>}
        </div>
      )}
      {/* respostas vazias não contam; só para o leitor de tela saber */}
      <span className="sr-only">{ativas.filter((p) => p.obrigatoria && vazio(respostas[chaveResposta(p.id)])).length} obrigatórias em branco</span>
    </section>
  );
}
