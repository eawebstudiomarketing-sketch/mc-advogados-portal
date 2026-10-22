"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, Loader2, MessageCircle, Printer, Tag, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  buscarConversaAction,
  comentarAlertaAction,
  compartilharNoZapAction,
  concluirAndamentosAction,
  historicoManualAction,
  prepararCompartilharAction,
  salvarEtiquetasAlertaAction,
  type AcaoState,
  type DestinoZap,
} from "./actions";

// Menus e janelas das telas de tratar (iguais às do Astrea).

function useFora<T extends HTMLElement>(aberto: boolean, fechar: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && fechar();
    const k = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("mousedown", f);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", f);
      document.removeEventListener("keydown", k);
    };
  }, [aberto, fechar]);
  return ref;
}

function Janela({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={titulo} onClick={onFechar}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-5 py-3">
          <p className="flex-1 font-semibold text-foreground">{titulo}</p>
          <button type="button" onClick={onFechar} className="icon-btn" aria-label="Fechar">
            <X aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

const inicial: AcaoState = { ok: false, erro: null };

function FormTexto({
  acao,
  ocultos,
  rotulo,
  comData = false,
  onPronto,
}: {
  acao: (p: AcaoState, f: FormData) => Promise<AcaoState>;
  ocultos: Record<string, string | null | undefined>;
  rotulo: string;
  comData?: boolean;
  onPronto: () => void;
}) {
  const [state, action, pending] = useActionState(acao, inicial);
  useEffect(() => {
    if (state.ok) {
      toast.success("Salvo.");
      onPronto();
    }
  }, [state, onPronto]);
  return (
    <form action={action} className="space-y-3">
      {Object.entries(ocultos).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {comData && (
        <label className="block">
          <span className="ui-label">Data</span>
          <input type="date" name="data" defaultValue={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date())} className="ui-input" />
        </label>
      )}
      <label className="block">
        <span className="ui-label">{rotulo}</span>
        <textarea name="texto" rows={5} required className="ui-input" autoFocus />
      </label>
      {state.erro && <p className="text-sm text-status-danger">{state.erro}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onPronto} className="ui-btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="ui-btn">
          {pending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function Compartilhar({ clientId, texto: textoInicial, andamentoId, onPronto }: { clientId: string | null; texto: string; andamentoId: string | null; onPronto: () => void }) {
  const [dados, setDados] = useState<{ destinos: DestinoZap[]; agenteNoAr: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [destino, setDestino] = useState("");
  const [texto, setTexto] = useState(textoInicial);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<DestinoZap[]>([]);
  const [extras, setExtras] = useState<DestinoZap[]>([]);
  const [enviando, start] = useTransition();
  useEffect(() => {
    void prepararCompartilharAction(clientId).then((r) => {
      if (!r.ok) return setErro(r.erro);
      setDados(r);
      setDestino(r.destinos.find((d) => d.sugerido)?.jid ?? "");
    });
  }, [clientId]);
  if (erro) return <p className="text-sm text-status-danger">{erro}</p>;
  if (!dados)
    return (
      <div className="flex justify-center py-10 text-muted">
        <Loader2 className="h-5 w-5 animate-spin" aria-label="Carregando" />
      </div>
    );
  const lista = [...dados.destinos, ...extras];
  return (
    <div className="space-y-4">
      {!dados.agenteNoAr && <p className="rounded-xl bg-status-danger-bg px-3 py-2 text-xs text-status-danger">O WhatsApp do escritório está fora do ar agora: o envio não vai sair.</p>}
      <div>
        <p className="ui-label">Para</p>
        {lista.length > 0 && (
          <ul className="mb-2 space-y-1">
            {lista.map((d) => (
              <li key={d.jid}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm ${destino === d.jid ? "border-navy-3 bg-navy/[0.04]" : "border-border hover:border-border-strong"}`}>
                  <input type="radio" name="destino" checked={destino === d.jid} onChange={() => setDestino(d.jid)} className="accent-navy" />
                  {d.grupo ? <Users className="h-4 w-4 text-muted" aria-hidden /> : <MessageCircle className="h-4 w-4 text-muted" aria-hidden />}
                  <span className="flex-1 truncate">{d.nome}</span>
                  {d.sugerido && <span className="text-[11px] text-muted">sugerido</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
        <input
          value={busca}
          onChange={async (e) => {
            setBusca(e.target.value);
            setAchados(e.target.value.trim().length >= 2 ? await buscarConversaAction(e.target.value) : []);
          }}
          placeholder="Buscar outra conversa pelo nome ou número"
          className="ui-input"
        />
        {achados.length > 0 && (
          <ul className="mt-1 rounded-xl border border-border">
            {achados.map((d) => (
              <li key={d.jid}>
                <button
                  type="button"
                  onClick={() => {
                    if (!lista.some((x) => x.jid === d.jid)) setExtras((x) => [...x, d]);
                    setDestino(d.jid);
                    setBusca("");
                    setAchados([]);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  {d.nome}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="block">
        <span className="ui-label">Mensagem</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} className="ui-input" />
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onPronto} className="ui-btn-secondary">
          Cancelar
        </button>
        <button
          type="button"
          disabled={!destino || enviando}
          onClick={() =>
            start(async () => {
              const r = await compartilharNoZapAction(destino, texto, andamentoId);
              if (!r.ok) return void toast.error(r.erro);
              toast.success("Enviado no WhatsApp.");
              onPronto();
            })
          }
          className="ui-btn"
        >
          {enviando ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}

type Janelas = "historico" | "comentario" | "zap" | null;

/**
 * "TRATAR ANDAMENTO ▾" (andamento) ou "TRATAMENTOS ▾" (publicação):
 * Adicionar tarefa / evento / histórico manual (+ WhatsApp e comentário no andamento).
 */
export function MenuTratar({
  rotulo,
  variante = "link",
  hrefTarefa,
  hrefEvento,
  processId,
  andamentoId = null,
  publicacaoId = null,
  clientId = null,
  textoZap = "",
  completo = false,
}: {
  rotulo: string;
  variante?: "link" | "botao";
  hrefTarefa: string;
  hrefEvento: string;
  processId: string | null;
  andamentoId?: string | null;
  publicacaoId?: string | null;
  clientId?: string | null;
  textoZap?: string;
  /** com "Compartilhar via WhatsApp" e "Adicionar comentário" (menu do andamento) */
  completo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [janela, setJanela] = useState<Janelas>(null);
  const ref = useFora<HTMLDivElement>(aberto, () => setAberto(false));
  const item = "block w-full px-4 py-2.5 text-left text-sm text-foreground hover:bg-surface-2";
  const abrir = (j: Janelas) => {
    setAberto(false);
    setJanela(j);
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={
          variante === "botao"
            ? "ui-btn inline-flex items-center gap-1.5 uppercase"
            : "inline-flex items-center gap-1 text-[12px] font-semibold tracking-wide text-navy-3 uppercase hover:underline"
        }
      >
        {rotulo} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
          <Link href={hrefTarefa} className={item} role="menuitem">
            Adicionar tarefa
          </Link>
          <Link href={hrefEvento} className={item} role="menuitem">
            Adicionar evento
          </Link>
          <button type="button" className={item} role="menuitem" onClick={() => abrir("historico")}>
            Adicionar histórico manual
          </button>
          {completo && (
            <>
              <button type="button" className={item} role="menuitem" onClick={() => abrir("zap")}>
                Compartilhar via WhatsApp
              </button>
              <button type="button" className={item} role="menuitem" onClick={() => abrir("comentario")}>
                Adicionar comentário
              </button>
            </>
          )}
        </div>
      )}
      {janela === "historico" && (
        <Janela titulo="Adicionar histórico manual" onFechar={() => setJanela(null)}>
          <FormTexto acao={historicoManualAction} ocultos={{ process_id: processId, andamento_id: andamentoId }} rotulo="Descrição" comData onPronto={() => setJanela(null)} />
        </Janela>
      )}
      {janela === "comentario" && (
        <Janela titulo="Adicionar comentário" onFechar={() => setJanela(null)}>
          <FormTexto acao={comentarAlertaAction} ocultos={{ andamento_id: andamentoId, publicacao_id: publicacaoId }} rotulo="Comentário" onPronto={() => setJanela(null)} />
        </Janela>
      )}
      {janela === "zap" && (
        <Janela titulo="Compartilhar via WhatsApp" onFechar={() => setJanela(null)}>
          <Compartilhar clientId={clientId} texto={textoZap} andamentoId={andamentoId} onPronto={() => setJanela(null)} />
        </Janela>
      )}
    </div>
  );
}

/** Ícone de etiqueta: escolhe as etiquetas do portal para o andamento/publicação. */
export function EtiquetasBotao({
  andamentoId = null,
  publicacaoId = null,
  todas,
  atuais,
  grande = false,
}: {
  andamentoId?: string | null;
  publicacaoId?: string | null;
  todas: { nome: string; cor: string }[];
  atuais: string[];
  grande?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useFora<HTMLDivElement>(aberto, () => setAberto(false));
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Etiquetas"
        data-tip="Etiquetas"
        className={grande ? "icon-btn" : "text-foreground/55 hover:text-foreground"}
      >
        <Tag className={grande ? undefined : "h-4 w-4"} aria-hidden />
      </button>
      {aberto && (
        <form
          action={async (f) => {
            await salvarEtiquetasAlertaAction(f);
            setAberto(false);
          }}
          className="absolute left-0 z-30 mt-1 w-64 rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          {andamentoId && <input type="hidden" name="andamento_id" value={andamentoId} />}
          {publicacaoId && <input type="hidden" name="publicacao_id" value={publicacaoId} />}
          <p className="mb-2 text-xs font-medium text-muted">Etiquetas</p>
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {todas.length === 0 && <p className="text-sm text-muted">Nenhuma etiqueta cadastrada.</p>}
            {todas.map((e) => (
              <label key={e.nome} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-surface-2">
                <input type="checkbox" name="etiqueta" value={e.nome} defaultChecked={atuais.includes(e.nome)} className="accent-navy" />
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.cor }} aria-hidden />
                {e.nome}
              </label>
            ))}
          </div>
          <button type="submit" className="ui-btn mt-3 w-full justify-center">
            Salvar
          </button>
        </form>
      )}
    </div>
  );
}

/** "CONCLUIR ▾" com "Concluir e tratar o próximo". */
export function ConcluirAndamentos({ processId }: { processId: string }) {
  const [aberto, setAberto] = useState(false);
  const ref = useFora<HTMLDivElement>(aberto, () => setAberto(false));
  return (
    <div ref={ref} className="relative flex">
      <form action={concluirAndamentosAction}>
        <input type="hidden" name="process_id" value={processId} />
        <button type="submit" className="ui-btn-secondary rounded-r-none uppercase">
          Concluir
        </button>
      </form>
      <button type="button" onClick={() => setAberto((v) => !v)} aria-label="Mais opções de concluir" className="ui-btn-secondary rounded-l-none border-l-0 px-2">
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {aberto && (
        <form action={concluirAndamentosAction} className="absolute top-full right-0 z-30 mt-1 w-60 rounded-xl border border-border bg-surface py-1 shadow-lg">
          <input type="hidden" name="process_id" value={processId} />
          <input type="hidden" name="proximo" value="1" />
          <button type="submit" className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-2">
            Concluir e tratar o próximo
          </button>
        </form>
      )}
    </div>
  );
}

export function Imprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="icon-btn" aria-label="Imprimir" data-tip="Imprimir">
      <Printer aria-hidden />
    </button>
  );
}
