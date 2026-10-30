"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

// Botão "Instalar o app" no rodapé do menu (item 32 da auditoria, 30/10/2026).
// Android/Chrome/Edge: abre a janela de instalação do navegador. iPhone: o
// Safari não tem essa janela, então mostra o passo a passo. Já instalado: some.

type PedidoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstalarApp() {
  const [pedido, setPedido] = useState<PedidoInstalacao | null>(null);
  const [iphone, setIphone] = useState(false);
  const [dica, setDica] = useState(false);
  const [instalado, setInstalado] = useState(true); // começa escondido até saber

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const pegar = (e: Event) => {
      e.preventDefault();
      setPedido(e as PedidoInstalacao);
    };
    const pronto = () => {
      setPedido(null);
      setInstalado(true);
    };
    window.addEventListener("beforeinstallprompt", pegar);
    window.addEventListener("appinstalled", pronto);
    // lê o navegador uma vez ao abrir (não existe no servidor)
    queueMicrotask(() => {
      setInstalado(standalone);
      setIphone(ios);
    });
    return () => {
      window.removeEventListener("beforeinstallprompt", pegar);
      window.removeEventListener("appinstalled", pronto);
    };
  }, []);

  if (instalado || (!pedido && !iphone)) return null;

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={async () => {
          if (pedido) {
            await pedido.prompt();
            await pedido.userChoice.catch(() => undefined);
            setPedido(null);
          } else setDica((d) => !d);
        }}
        className="flex h-10 w-full items-center gap-3 rounded-xl px-[11px] text-sm font-medium text-foreground/70 hover:bg-hover hover:text-foreground"
      >
        <Smartphone className="h-[18px] w-[18px]" aria-hidden /> Instalar o app
      </button>
      {dica && (
        <div className="relative mx-1 mt-1 rounded-xl bg-surface-2 p-3 pr-8 text-xs leading-relaxed text-foreground/80">
          No iPhone: toque em <strong>Compartilhar</strong> (o quadrado com a seta) e depois em <strong>Adicionar à Tela de Início</strong>.
          <button type="button" onClick={() => setDica(false)} aria-label="Fechar dica" className="absolute top-2 right-2 rounded p-0.5 text-muted hover:text-foreground">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
