"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Paperclip, Send, X } from "lucide-react";

const MAX_BYTES = 4 * 1024 * 1024;

export function FormPedido() {
  const router = useRouter();
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [urgente, setUrgente] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
      <div>
        <label htmlFor="titulo" className="eyebrow block">
          01 · O que você precisa
        </label>
        <input
          id="titulo"
          name="titulo"
          required
          maxLength={140}
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
          04 · Tem data limite? <span className="normal-case tracking-normal">(opcional)</span>
        </label>
        <input id="prazo" name="prazo" type="date" className="ui-input mt-2 max-w-[14rem]" />
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
