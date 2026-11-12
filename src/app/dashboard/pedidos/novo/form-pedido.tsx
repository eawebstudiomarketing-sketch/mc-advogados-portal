"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { AudioAnswer } from "@/components/ui/audio-answer";

const MAX_BYTES = 4 * 1024 * 1024;

export function FormPedido({ tituloInicial = "", descricaoInicial = "" }: { tituloInicial?: string; descricaoInicial?: string } = {}) {
  const router = useRouter();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [urgente, setUrgente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [titulo, setTitulo] = useState(tituloInicial);
  const [descricao, setDescricao] = useState(descricaoInicial);
  const [audio, setAudio] = useState<Blob | null>(null);
  const audioUrl = useAudioUrl(audio);

  function aoTranscrever(dados: Record<string, string>, blob: Blob) {
    setAudio(blob);
    if (!titulo.trim() && dados.titulo) setTitulo(dados.titulo);
    setDescricao((d) => (d.trim() ? `${d.trim()}

${dados.resposta}` : dados.resposta));
    toast.success("Áudio transcrito", { description: "Confira o texto abaixo e envie." });
  }

  function escolher(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setErro("Arquivo grande demais (máx. 4 MB). Se precisar, mande por e-mail ao escritório.");
      return;
    }
    setErro(null);
    setArquivo(f);
  }

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get("titulo") ?? "").trim()) {
      setErro("Conte em poucas palavras do que você precisa.");
      return;
    }
    fd.set("urgencia", urgente ? "urgente" : "normal");
    fd.delete("arquivo");
    if (arquivo) fd.set("arquivo", arquivo);
    if (audio) {
      const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
      fd.set("audio", audio, `audio-do-pedido.${ext}`);
    }
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/cliente/pedidos", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(data.error ?? "Não foi possível enviar. Tente novamente.");
        return;
      }
      toast.success("Pedido enviado", { description: "O escritório já recebeu. Acompanhe por aqui." });
      router.push("/dashboard/pedidos");
      router.refresh();
    } catch {
      setErro("Falha de conexão ao enviar. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-8 space-y-7">
      {/* falar em vez de escrever: o áudio vira texto e vai junto com o pedido */}
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        {audio && audioUrl ? (
          <div className="space-y-3">
            <p className="eyebrow flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-status-success" aria-hidden /> Seu áudio vai junto com o pedido
            </p>
            <div className="flex items-center gap-2">
              <audio src={audioUrl} controls className="h-10 min-w-0 flex-1" />
              <button type="button" onClick={() => setAudio(null)} className="icon-btn" aria-label="Tirar o áudio" data-tip="Tirar o áudio">
                <X aria-hidden />
              </button>
            </div>
            <p className="text-xs text-muted">O texto abaixo foi escrito a partir dele. Pode ajustar à vontade.</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <AudioAnswer
              endpoint="/api/cliente/pedidos/transcrever"
              onTexto={() => {}}
              onDados={aoTranscrever}
              destaque
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Prefere falar? Grave um áudio.</p>
              <p className="text-xs text-muted">Até 4 minutos. A gente escreve o pedido pra você conferir antes de enviar.</p>
            </div>
          </div>
        )}
      </div>

      <div>
        <label htmlFor="titulo" className="eyebrow block">
          01 · O que você precisa
        </label>
        <input
          id="titulo"
          name="titulo"
          required
          maxLength={140}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex.: Revisar o contrato com o fornecedor novo"
          className="mt-2 w-full border-0 border-b-2 border-border bg-transparent px-0 py-2 font-display text-xl font-bold text-foreground placeholder:font-normal placeholder:text-muted/60 focus:border-navy focus:ring-0 focus:outline-none sm:text-2xl"
        />
      </div>

      <div>
        <label htmlFor="descricao" className="eyebrow block">
          02 · Detalhes <span className="normal-case tracking-normal">(opcional)</span>
        </label>
        <textarea
          id="descricao"
          name="descricao"
          rows={4}
          maxLength={4000}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Contexto, nomes, valores, o que já aconteceu…"
          className="ui-input mt-2"
        />
      </div>

      <div>
        <p className="eyebrow">03 · Urgência</p>
        <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Urgência">
          {[
            { v: false, titulo: "Normal", texto: "No fluxo do escritório" },
            { v: true, titulo: "Urgente", texto: "Precisa de atenção logo" },
          ].map((o) => {
            const on = urgente === o.v;
            return (
              <button
                key={o.titulo}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setUrgente(o.v)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  on ? (o.v ? "border-status-danger bg-status-danger-bg" : "border-navy bg-navy/[0.05]") : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <span className={`flex items-center gap-2 text-sm font-semibold ${on && o.v ? "text-status-danger" : "text-foreground"}`}>
                  <span className={`h-2 w-2 rounded-full ${o.v ? "bg-status-danger" : "bg-status-info"}`} aria-hidden />
                  {o.titulo}
                </span>
                <span className="mt-1 block text-xs text-muted">{o.texto}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="prazo" className="eyebrow block">
          04 · Tem data e horário limite? <span className="normal-case tracking-normal">(opcional)</span>
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <input id="prazo" name="prazo" type="date" className="ui-input max-w-[14rem]" />
          <input name="hora" type="time" aria-label="Horário (opcional)" className="ui-input max-w-[9rem]" />
        </div>
      </div>

      <div>
        <p className="eyebrow">05 · Anexo <span className="normal-case tracking-normal">(opcional)</span></p>
        <input
          ref={arquivoRef}
          id="arquivo"
          name="arquivo"
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.txt"
          onChange={(e) => escolher(e.target.files?.[0])}
        />
        {arquivo ? (
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
            <Paperclip className="h-4 w-4 shrink-0 text-navy" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{arquivo.name}</span>
            <button
              type="button"
              onClick={() => {
                setArquivo(null);
                if (arquivoRef.current) arquivoRef.current.value = "";
              }}
              className="icon-btn"
              aria-label="Tirar anexo"
            >
              <X aria-hidden />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => arquivoRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              escolher(e.dataTransfer.files?.[0]);
            }}
            className="mt-2 flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-border-strong px-4 py-6 text-center transition-colors hover:border-navy hover:bg-surface"
          >
            <Paperclip className="h-5 w-5 text-muted" aria-hidden />
            <span className="text-sm font-medium text-foreground">Anexar um arquivo</span>
            <span className="text-xs text-muted">PDF, Word, planilha ou foto, até 4 MB</span>
          </button>
        )}
      </div>

      {erro && <p className="text-sm text-status-danger">{erro}</p>}

      <button type="submit" disabled={enviando} className="ui-btn w-full py-3 sm:w-auto sm:px-8">
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        {enviando ? "Enviando…" : "Enviar pedido"}
      </button>
    </form>
  );
}

/** Link temporário do áudio gravado, pro player (liberado ao trocar/sair). */
function useAudioUrl(blob: Blob | null) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}
