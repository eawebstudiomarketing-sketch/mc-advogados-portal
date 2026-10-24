"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { ArrowRight, Check, ChevronDown, RefreshCw, UserRoundCheck } from "lucide-react";
import { gerenteAction, reatribuirAction } from "@/app/admin/painel/actions";
import type { AcaoGerente, Gerente } from "@/lib/painel/gerente";

// O "gerente": resumo do período + o que fazer, no topo de todas as abas.
// Vem do cache (1 chamada barata à IA por período; hoje vale 1 hora).

const CHAVE_FECHADO = "mc:painel-gerente-fechado";

function saudacao() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Bahia", hour: "2-digit", hour12: false })) % 24;
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function BotaoAcao({ acao }: { acao: AcaoGerente }) {
  const [pendente, iniciar] = useTransition();
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (acao.tipo === "abrir")
    return (
      <Link href={acao.href} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:border-border-strong">
        {acao.rotulo} <ArrowRight className="h-3 w-3" aria-hidden />
      </Link>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pendente || feito}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await reatribuirAction(acao.activityId, acao.paraId);
            if (r.error) setErro(r.error);
            else setFeito(true);
          })
        }
        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${feito ? "bg-status-success-bg text-status-success" : "bg-navy text-white hover:bg-navy-3"}`}
      >
        {feito ? <Check className="h-3 w-3" aria-hidden /> : <UserRoundCheck className="h-3 w-3" aria-hidden />}
        {feito ? `Passada para ${acao.paraNome}` : pendente ? "Passando…" : acao.rotulo}
      </button>
      {erro && <span className="text-xs text-status-danger">{erro}</span>}
    </span>
  );
}

function lerFechado() {
  try {
    return localStorage.getItem(CHAVE_FECHADO) === "1";
  } catch {
    return false;
  }
}
const ouvintes = new Set<() => void>();
const assinar = (cb: () => void) => {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
};

export function GerentePainel({ periodoId, nome }: { periodoId: string; nome: string }) {
  const [res, setRes] = useState<{ periodoId: string; gerente?: Gerente; error?: string } | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const fechado = useSyncExternalStore(assinar, lerFechado, () => false);
  const ola = saudacao();

  useEffect(() => {
    let vivo = true;
    gerenteAction(periodoId).then((r) => {
      if (vivo) setRes({ periodoId, ...r });
    });
    return () => {
      vivo = false;
    };
  }, [periodoId]);

  const atual = res?.periodoId === periodoId ? res : null;
  const dados = atual?.gerente ?? null;
  const erro = atual?.error ?? null;
  const carregando = !atual || atualizando;
  const atualizar = () => {
    setAtualizando(true);
    gerenteAction(periodoId, true).then((r) => {
      setAtualizando(false);
      setRes((v) => ({ periodoId, gerente: r.gerente ?? v?.gerente, error: r.gerente ? undefined : r.error ?? "Não foi possível atualizar." }));
    });
  };
  const alternar = () => {
    try {
      localStorage.setItem(CHAVE_FECHADO, fechado ? "0" : "1");
    } catch {}
    ouvintes.forEach((cb) => cb());
  };
  const cor = { alta: "bg-status-danger", media: "bg-status-pending", baixa: "bg-status-success" };

  return (
    <section className="ui-card overflow-hidden" aria-label="Resumo do gerente">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2/60 px-5 py-4">
        <div className="min-w-0">
          <p className="text-lg font-semibold text-foreground">
            {ola}, {nome}.
          </p>
          <p className="text-sm text-muted">Aqui está o resumo do escritório · {dados?.periodo.toLowerCase() ?? "carregando…"}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {dados && (
            <span className="hidden text-[11px] text-muted sm:inline">
              atualizado {new Date(dados.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button type="button" onClick={atualizar} disabled={carregando} className="icon-btn" aria-label="Atualizar resumo" title="Atualizar (refaz se tiver mais de 10 min)">
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} aria-hidden />
          </button>
          <button type="button" onClick={alternar} className="icon-btn" aria-label={fechado ? "Mostrar resumo" : "Recolher resumo"} aria-expanded={!fechado}>
            <ChevronDown className={`h-4 w-4 transition-transform ${fechado ? "-rotate-90" : ""}`} aria-hidden />
          </button>
        </div>
      </div>
      {!fechado && (
        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0">
            <p className="eyebrow mb-2">Resumo</p>
            {carregando && !dados ? (
              <div className="space-y-2" aria-busy>
                {[100, 92, 96, 70].map((w, k) => (
                  <div key={k} className="skeleton h-3.5 rounded" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : erro && !dados ? (
              <p className="text-sm text-status-danger">{erro}</p>
            ) : (
              <div className="space-y-3 text-[15px] leading-relaxed text-foreground">
                {dados?.resumo.map((p, k) => (
                  <p key={k}>{p}</p>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="eyebrow mb-2">O que eu sugiro</p>
            {carregando && !dados ? (
              <div className="space-y-3">
                {[0, 1, 2].map((k) => (
                  <div key={k} className="skeleton h-12 rounded-lg" />
                ))}
              </div>
            ) : dados?.sugestoes.length ? (
              <ol className="space-y-3">
                {dados.sugestoes.map((s, k) => (
                  <li key={k} className="flex gap-3 rounded-lg border border-border p-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${cor[s.prioridade]}`} title={`Prioridade ${s.prioridade}`} />
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{s.texto}</p>
                      {s.acoes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {s.acoes.map((a, j) => (
                            <BotaoAcao key={j} acao={a} />
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Nada urgente agora.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
