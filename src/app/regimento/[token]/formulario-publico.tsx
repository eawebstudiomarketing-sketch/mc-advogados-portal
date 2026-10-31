"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CircleCheck, Loader2 } from "lucide-react";
import { CampoPergunta } from "@/components/regimentos/campo-pergunta";
import type { Resposta, Respostas, Secao } from "@/lib/regimentos/tipos";
import { enviarRespostasAction, salvarRascunhoAction } from "./actions";

// Formulário público do Regimento (como o Google Forms): cabeçalho com título e
// objetivo, uma seção por página com Voltar/Próxima e barra de progresso,
// Enviar na última. O que a empresa digita é salvo sozinho no servidor (pode
// fechar e voltar pelo mesmo link).

export function FormularioPublico({ token, titulo, descricao, secoes, inicial, fechado, jaEnviado }: { token: string; titulo: string; descricao: string; secoes: Secao[]; inicial: Respostas; fechado: boolean; jaEnviado: boolean }) {
  const [respostas, setRespostas] = useState<Respostas>(inicial);
  const [pagina, setPagina] = useState(0);
  const [respondente, setRespondente] = useState("");
  const [enviado, setEnviado] = useState(jaEnviado);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<"" | "salvando" | "salvo">("");
  const [pending, start] = useTransition();
  const mudou = useRef(false);
  const topo = useRef<HTMLDivElement>(null);

  // salva o rascunho 2 s depois da última digitação
  useEffect(() => {
    if (!mudou.current || enviado || fechado) return;
    const t = setTimeout(async () => {
      setSalvo("salvando");
      const r = await salvarRascunhoAction(token, respostas);
      setSalvo(r.ok ? "salvo" : "");
    }, 2000);
    return () => clearTimeout(t);
  }, [respostas, token, enviado, fechado]);

  const mudar = (id: string, v: Resposta) => {
    mudou.current = true;
    setRespostas((r) => ({ ...r, [id]: v }));
  };
  const irPara = (n: number) => {
    setPagina(n);
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cabecalho = (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="h-2.5 bg-navy" />
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-foreground">{titulo}</h1>
        {descricao && <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-foreground/85">{descricao}</p>}
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted">MC Advogados · suas respostas ficam salvas enquanto você responde; dá para fechar e voltar pelo mesmo link.</p>
      </div>
    </div>
  );

  if (enviado || fechado)
    return (
      <main className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-[770px] space-y-3">
          {cabecalho}
          <div className="rounded-lg border border-border bg-surface p-6 text-sm text-foreground">
            {enviado ? (
              <p className="flex items-center gap-2">
                <CircleCheck className="h-5 w-5 text-status-success" aria-hidden /> Sua resposta foi registrada. Obrigado! O escritório vai analisar e entrar em contato.
              </p>
            ) : (
              <p>Este formulário não está mais aceitando respostas. Fale com o escritório se precisar.</p>
            )}
          </div>
        </div>
      </main>
    );

  const s = secoes[pagina];
  const ultima = pagina === secoes.length - 1;
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div ref={topo} className="mx-auto max-w-[770px] scroll-mt-4 space-y-3">
        {pagina === 0 && cabecalho}
        <div className="flex items-center gap-3 text-xs text-muted">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-track" aria-hidden>
            <div className="h-full rounded-full bg-navy transition-all" style={{ width: `${((pagina + 1) / secoes.length) * 100}%` }} />
          </div>
          Página {pagina + 1} de {secoes.length}
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="bg-navy px-6 py-3 text-sm font-semibold text-white">{s.titulo}</div>
          {s.descricao && <p className="px-6 py-4 text-sm text-foreground/80">{s.descricao}</p>}
        </div>
        {s.perguntas.map((p) => (
          <CampoPergunta key={p.id} p={p} valor={respostas[p.id]} onChange={(v) => mudar(p.id, v)} />
        ))}
        {ultima && (
          <div className="rounded-lg border border-border bg-surface p-6">
            <label className="block text-[15px] text-foreground">
              Seu nome (quem respondeu)
              <input value={respondente} onChange={(e) => setRespondente(e.target.value)} placeholder="Sua resposta" className="mt-3 block w-full border-0 border-b border-border bg-transparent px-0 py-1.5 text-sm focus:border-b-2 focus:border-navy focus:ring-0 focus:outline-none sm:w-1/2" />
            </label>
          </div>
        )}
        {erro && <p className="rounded-lg border border-status-danger/40 bg-status-danger-bg px-4 py-3 text-sm text-status-danger">{erro}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1 pb-10">
          {pagina > 0 && (
            <button type="button" onClick={() => irPara(pagina - 1)} className="ui-btn-secondary">
              Voltar
            </button>
          )}
          {!ultima ? (
            <button type="button" onClick={() => irPara(pagina + 1)} className="ui-btn">
              Próxima
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setErro(null);
                  const r = await enviarRespostasAction(token, respostas, respondente);
                  if (!r.ok) return void setErro(r.error);
                  setEnviado(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                })
              }
              className="ui-btn"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Enviar
            </button>
          )}
          <span className="ml-auto text-xs text-muted">{salvo === "salvando" ? "Salvando…" : salvo === "salvo" ? "Rascunho salvo" : ""}</span>
        </div>
      </div>
    </main>
  );
}
