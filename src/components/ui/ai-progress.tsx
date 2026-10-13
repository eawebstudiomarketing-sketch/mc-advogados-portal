"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";

// Progresso "em etapas" enquanto o Gemini trabalha (30-60s). As etapas
// avançam pelo tempo decorrido: é uma indicação de andamento, não um
// relatório exato do que a IA está fazendo.
export function AiProgress({ titulo, etapas, segundosPorEtapa = 9 }: { titulo: string; etapas: string[]; segundosPorEtapa?: number }) {
  const [seg, setSeg] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeg((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const atual = Math.min(Math.floor(seg / segundosPorEtapa), etapas.length - 1);

  return (
    <div className="ui-card max-w-xl overflow-hidden" role="status" aria-live="polite">
      <div className="flex items-center gap-3 bg-navy-2 px-5 py-4 text-white">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
          <Sparkles className="h-4 w-4 text-gold-2" aria-hidden />
          <span className="absolute inset-0 animate-ping rounded-xl bg-gold/20 [animation-duration:2s]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{titulo}</p>
          <p className="text-xs text-white/55 tabular-nums">{seg}s · costuma levar de 30 segundos a 1 minuto</p>
        </div>
      </div>
      <ol className="space-y-0.5 px-5 py-4">
        {etapas.map((e, i) => {
          const feita = i < atual;
          const agora = i === atual;
          return (
            <li key={e} className={`flex items-center gap-3 rounded-lg py-1.5 text-sm transition-colors duration-300 ${agora ? "text-foreground" : feita ? "text-muted" : "text-muted/60"}`}>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                  feita ? "bg-status-success text-white" : agora ? "bg-navy text-white" : "bg-surface-2 ring-1 ring-border"
                }`}
              >
                {feita ? (
                  <Check className="h-3 w-3" aria-hidden />
                ) : agora ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-2" aria-hidden />
                ) : null}
              </span>
              <span className={agora ? "font-medium" : ""}>{e}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
