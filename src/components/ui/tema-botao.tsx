"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

// Botão sol/lua: troca entre claro e escuro e o navegador lembra a escolha.
// Sem escolha salva, segue o celular/computador (script no <head> do layout).

const ouvir = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};
const escuroAgora = () => document.documentElement.dataset.theme === "dark";

export function TemaBotao({ className = "" }: { className?: string }) {
  const escuro = useSyncExternalStore(ouvir, escuroAgora, () => false);

  function trocar() {
    const html = document.documentElement;
    html.classList.add("trocando-tema");
    if (escuro) delete html.dataset.theme;
    else html.dataset.theme = "dark";
    try {
      localStorage.setItem("tema", escuro ? "claro" : "escuro");
    } catch {}
    window.setTimeout(() => html.classList.remove("trocando-tema"), 260);
  }

  return (
    <button
      type="button"
      onClick={trocar}
      aria-label={escuro ? "Mudar para o modo claro" : "Mudar para o modo noturno"}
      data-tip={escuro ? "Modo claro" : "Modo noturno"}
      className={`relative rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-foreground ${className}`}
    >
      {escuro ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  );
}
