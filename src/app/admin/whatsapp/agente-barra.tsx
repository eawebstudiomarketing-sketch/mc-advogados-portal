"use client";

import { useState } from "react";
import { ChevronUp, Loader2, Power, QrCode, RefreshCw, Smartphone, Unplug, X } from "lucide-react";
import type { WaAgente } from "@/lib/whatsapp";
import { cancelarQrAction, desligarAgenteAction, gerarQrAction, sairDoNumeroAction } from "./actions";
import { telefone } from "./util";

// Status do Agente (servidor que conecta o número): fica recolhido numa barra
// fina embaixo; abre sozinho quando precisa de atenção (fora do ar, QR, sem número).

export function BarraAgente({ agente, ligado }: { agente: WaAgente | null; ligado: boolean }) {
  const estado = !ligado ? "agente_off" : agente?.estado === "desligado" ? "sem_numero" : (agente?.estado ?? "conectando");
  const precisa = estado !== "conectado" && estado !== "conectando";
  // escolha da pessoa vale; sem escolha, abre quando precisa de atenção
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const aberto = escolha ?? precisa;
  const setAberto = (f: (a: boolean) => boolean) => setEscolha(f(aberto));
  const cor = estado === "conectado" ? "bg-status-success" : estado === "agente_off" ? "bg-status-danger" : estado === "sem_numero" ? "bg-muted" : "bg-status-pending";
  const texto =
    estado === "conectado"
      ? `Conectado${agente?.numero ? ` · ${telefone(`${agente.numero}@s.whatsapp.net`)}` : ""}`
      : estado === "agente_off"
        ? "Agente fora do ar"
        : estado === "sem_numero"
          ? "Nenhum número conectado"
          : estado === "aguardando_qr"
            ? "Escaneie o QR"
            : "Conectando…";

  return (
    <div className="mt-2">
      {aberto && (
        <div className="mb-2">
          <PainelAgente agente={agente} ligado={ligado} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-xs text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${cor}`} aria-hidden />
        <span className="truncate">{texto}</span>
        <span className="ml-auto inline-flex items-center gap-1">
          {aberto ? "Esconder" : "Número e Agente"}
          <ChevronUp className={`h-3.5 w-3.5 transition-transform ${aberto ? "" : "rotate-180"}`} aria-hidden />
        </span>
      </button>
    </div>
  );
}

function PainelAgente({ agente, ligado }: { agente: WaAgente | null; ligado: boolean }) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<"desconectar" | "trocar" | null>(null);

  // ligado + estado "desligado" = Agente rodando, mas sem número conectado
  const estado = !ligado ? "agente_off" : agente?.estado === "desligado" ? "sem_numero" : (agente?.estado ?? "conectando");
  const numero = agente?.numero ? telefone(`${agente.numero}@s.whatsapp.net`) : null;

  async function rodar(nome: string, fn: () => Promise<{ ok: boolean; erro?: string } | void>) {
    setOcupado(nome);
    setErro(null);
    try {
      const r = await fn();
      if (r && !r.ok) setErro(r.erro ?? "Não deu certo.");
      else setConfirmar(null);
    } finally {
      setOcupado(null);
    }
  }

  const ROTULO: Record<string, { texto: string; cor: string }> = {
    agente_off: { texto: "Agente fora do ar", cor: "bg-status-danger" },
    sem_numero: { texto: "Nenhum número conectado", cor: "bg-muted" },
    conectando: { texto: "Conectando…", cor: "bg-status-pending" },
    aguardando_qr: { texto: "Escaneie o QR com o celular", cor: "bg-status-pending" },
    conectado: { texto: "Conectado", cor: "bg-status-success" },
  };
  const r = ROTULO[estado] ?? ROTULO.conectando;
  const subtitulo =
    estado === "agente_off"
      ? "O Agente roda no servidor e religa sozinho. Se continuar assim por alguns minutos, avise o suporte."
      : estado === "sem_numero"
        ? "O Agente está ligado. Clique em “Conectar número” para gerar o QR."
        : [numero && `Número ${numero}`, agente?.label].filter(Boolean).join(" · ") || "—";
  const icone = (nome: string, Icone: typeof Power) =>
    ocupado === nome ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Icone className="h-3.5 w-3.5" aria-hidden />;

  return (
    <div className="ui-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative flex h-3 w-3">
          {estado === "conectado" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-success opacity-50" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${r.cor}`} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-semibold text-foreground">{r.texto}</p>
          <p className="text-xs text-muted">{subtitulo}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {estado === "sem_numero" && (
            <button type="button" disabled={!!ocupado} onClick={() => void rodar("qr", gerarQrAction)} className="ui-btn px-3 py-1.5 text-xs">
              {icone("qr", QrCode)} Conectar número
            </button>
          )}
          {estado === "conectado" && (
            <>
              <button type="button" onClick={() => setConfirmar(confirmar === "trocar" ? null : "trocar")} className="ui-btn-secondary px-3 py-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Trocar número
              </button>
              <button type="button" onClick={() => setConfirmar(confirmar === "desconectar" ? null : "desconectar")} className="ui-btn-secondary px-3 py-1.5 text-xs">
                <Unplug className="h-3.5 w-3.5" aria-hidden /> Desconectar
              </button>
            </>
          )}
          {ligado && (
            <button
              type="button"
              disabled={!!ocupado}
              onClick={() => void rodar("desligar", desligarAgenteAction)}
              className="ui-btn-secondary px-3 py-1.5 text-xs"
              title="No servidor, o Agente religa sozinho em alguns segundos"
            >
              {icone("desligar", Power)} Reiniciar Agente
            </button>
          )}
        </div>
      </div>

      {estado === "aguardando_qr" && agente?.qr && (
        <div className="mt-4 flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-4 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agente.qr} alt="QR para conectar o WhatsApp" className="h-56 w-56 rounded-lg bg-white p-2" />
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
            <li>No celular com o número que vai ser usado, abra o WhatsApp.</li>
            <li>
              Toque em <b>⋮</b> (ou Configurações no iPhone) → <b>Aparelhos conectados</b> → <b>Conectar aparelho</b>.
            </li>
            <li>Aponte a câmera para este QR. O código troca sozinho aqui; se trocar enquanto você aponta, é só apontar de novo.</li>
            <li>Depois de conectar, deixe o celular com internet: o histórico de conversas vem dele e pode levar alguns minutos.</li>
            <li className="text-muted">Se ninguém escanear em uns 2 minutos, o QR para. É só clicar em “Conectar número” de novo.</li>
          </ol>
          {/* fica aqui embaixo, longe de onde estava "Conectar número" (o 2º clique cancelava o QR) */}
          <button type="button" disabled={!!ocupado} onClick={() => void rodar("cancelar", cancelarQrAction)} className="ui-btn-secondary self-end px-3 py-1.5 text-xs sm:self-start">
            {icone("cancelar", X)} Cancelar
          </button>
        </div>
      )}
      {estado === "aguardando_qr" && !agente?.qr && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Gerando o QR…
        </p>
      )}

      {agente?.ultimo_erro && ligado && estado !== "conectado" && <p className="mt-2 text-xs text-status-pending">{agente.ultimo_erro}</p>}

      {confirmar && (
        <div className="mt-4 rounded-xl border border-status-pending/30 bg-status-pending-bg p-4 text-sm">
          <p className="font-semibold text-foreground">
            {confirmar === "trocar" ? `Trocar ${numero ?? "o número"} por outro?` : `Desconectar ${numero ?? "o número"}?`}
          </p>
          <p className="mt-1 text-muted">
            {confirmar === "trocar"
              ? "O Agente sai deste número (some de “Aparelhos conectados” no celular) e já mostra aqui o QR para conectar o outro."
              : "O Agente sai deste número (some de “Aparelhos conectados” no celular) e fica parado, sem gerar QR, até você clicar em “Conectar número”."}{" "}
            As conversas já guardadas continuam no portal.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmar(null)} className="ui-btn-secondary px-3 py-1.5 text-xs">
              Cancelar
            </button>
            <button
              type="button"
              disabled={!!ocupado}
              onClick={() => void rodar("sair", () => sairDoNumeroAction(confirmar === "trocar"))}
              className="ui-btn px-3 py-1.5 text-xs"
            >
              {icone("sair", confirmar === "trocar" ? Smartphone : Unplug)} {confirmar === "trocar" ? "Desconectar e gerar QR" : "Desconectar"}
            </button>
          </div>
        </div>
      )}

      {erro && <p className="mt-2 text-xs text-status-danger">{erro}</p>}
    </div>
  );
}
