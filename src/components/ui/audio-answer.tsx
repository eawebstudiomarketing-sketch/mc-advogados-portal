"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Mic, Square, X, Loader2 } from "lucide-react";

const LIMITE_SEG = 240; // 4 minutos: o envio para o servidor tem limite de tamanho

type Estado = "parado" | "gravando" | "enviando";

function melhorFormato(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return undefined;
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Botão de microfone de uma pergunta do onboarding: grava, manda para o
// Gemini e devolve a resposta já escrita (onTexto). O áudio não é guardado.
export function AudioAnswer({
  pergunta = "",
  onTexto,
  modo = "resposta",
  grande = false,
  endpoint = "/api/transcrever",
  onDados,
  destaque = false,
}: {
  pergunta?: string;
  onTexto: (texto: string) => void;
  /** "comando": fala para o assistente do portal (transcreve o pedido, sem reescrever) */
  modo?: "resposta" | "comando";
  /** botão redondo de 40px (tela do assistente no celular) */
  grande?: boolean;
  /** outra rota de transcrição (ex.: pedido do cliente) */
  endpoint?: string;
  /** recebe a resposta inteira da rota e o áudio gravado */
  onDados?: (dados: Record<string, string>, audio: Blob) => void;
  /** microfone redondo grande em azul-marinho (formulário de pedido do cliente) */
  destaque?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>("parado");
  const [seg, setSeg] = useState(0);
  const [nivel, setNivel] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const partesRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelarRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  function limpar() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setNivel(0);
  }

  useEffect(() => () => limpar(), []);

  useEffect(() => {
    if (estado !== "gravando") return;
    const t = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [estado]);

  useEffect(() => {
    if (estado === "gravando" && seg >= LIMITE_SEG) {
      toast.info("Limite de 4 minutos: enviando o que foi gravado.");
      parar(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao contador
  }, [seg]);

  async function enviar(blob: Blob) {
    setEstado("enviando");
    try {
      const fd = new FormData();
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      fd.set("audio", blob, `resposta.${ext}`);
      fd.set("pergunta", pergunta);
      if (modo === "comando") fd.set("modo", "comando");
      const res = await fetch(endpoint, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.resposta) {
        toast.error(data.error ?? "Não foi possível transcrever. Tente de novo.");
        return;
      }
      onTexto(data.resposta);
      onDados?.(data, blob);
      if (modo === "resposta" && !onDados) toast.success("Resposta escrita a partir do áudio");
    } catch {
      toast.error("Falha de conexão ao enviar o áudio.");
    } finally {
      setEstado("parado");
    }
  }

  async function gravar() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador não permite gravar áudio.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error("Sem acesso ao microfone. Libere a permissão no navegador.");
      return;
    }
    streamRef.current = stream;
    const formato = melhorFormato();
    const rec = new MediaRecorder(stream, formato ? { mimeType: formato, audioBitsPerSecond: 32000 } : undefined);
    partesRef.current = [];
    cancelarRef.current = false;
    rec.ondataavailable = (e) => e.data.size && partesRef.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(partesRef.current, { type: rec.mimeType || formato || "audio/webm" });
      limpar();
      if (cancelarRef.current || blob.size === 0) {
        setEstado("parado");
        return;
      }
      void enviar(blob);
    };
    recRef.current = rec;
    rec.start(1000);
    setSeg(0);
    setEstado("gravando");

    // medidor de volume (as barrinhas mexem com a voz)
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let pico = 0;
        for (const b of buf) pico = Math.max(pico, Math.abs(b - 128));
        setNivel(Math.min(1, pico / 60));
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {}
  }

  function parar(cancelar: boolean) {
    cancelarRef.current = cancelar;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    else {
      limpar();
      setEstado("parado");
    }
  }

  if (estado === "enviando") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-navy/[0.06] px-3 py-1.5 text-xs font-medium text-navy-3" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {modo === "comando" ? "Entendendo…" : onDados ? "Transcrevendo o áudio…" : "Escrevendo a resposta…"}
      </span>
    );
  }

  if (estado === "gravando") {
    const barras = [0.55, 0.85, 1, 0.75, 0.5];
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-status-danger-bg py-1 pr-1 pl-3 text-xs font-medium text-status-danger" role="status">
        <span className="h-2 w-2 animate-pulse rounded-full bg-status-danger" aria-hidden />
        <span className="flex h-4 items-center gap-0.5" aria-hidden>
          {barras.map((b, i) => (
            <span key={i} className="w-0.5 rounded-full bg-status-danger transition-[height] duration-75" style={{ height: `${Math.max(3, nivel * b * 16)}px` }} />
          ))}
        </span>
        <span className="tabular-nums">{mmss(seg)}</span>
        <button type="button" onClick={() => parar(true)} className="icon-btn h-6 w-6 text-status-danger" aria-label="Descartar gravação" data-tip="Descartar">
          <X aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => parar(false)}
          className="inline-flex items-center gap-1 rounded-full bg-status-danger px-2.5 py-1 text-white transition-colors hover:bg-status-danger/90"
        >
          <Square className="h-3 w-3 fill-current" aria-hidden /> Enviar
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={gravar}
      className={
        destaque
          ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-navy text-gold-2 shadow-md shadow-navy/20 transition-transform active:scale-95"
          : grande
            ? "icon-btn h-10 w-10 rounded-full"
            : "icon-btn border border-border bg-surface"
      }
      aria-label={destaque ? "Gravar áudio" : modo === "comando" ? "Falar com o assistente" : "Responder por áudio"}
      data-tip={destaque ? undefined : modo === "comando" ? "Falar" : "Responder por áudio"}
    >
      <Mic className={destaque ? "h-5 w-5" : undefined} aria-hidden />
    </button>
  );
}
