"use client";

// Rascunho por conversa (16/11/2026): o que foi digitado e não enviado fica guardado
// neste navegador (localStorage) e volta quando a conversa é aberta de novo, mesmo
// depois de trocar de conversa, sair da aba ou fechar o portal. A lista mostra
// "Rascunho:" como no WhatsApp. Some ao enviar ou apagar o texto.
import { useSyncExternalStore } from "react";

const CHAVE = "wa-rascunhos";
const VALIDADE = 30 * 24 * 60 * 60 * 1000; // rascunho esquecido some depois de 30 dias
type Mapa = Record<string, { t: string; em: number }>;

let cache: Mapa | null = null;
const ouvintes = new Set<() => void>();

function ler(): Mapa {
  if (cache) return cache;
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) || "{}") as Mapa;
    const limite = Date.now() - VALIDADE;
    cache = Object.fromEntries(Object.entries(bruto).filter(([, v]) => v && typeof v.t === "string" && v.em > limite));
  } catch {
    cache = {};
  }
  return cache;
}

function gravar(m: Mapa) {
  cache = m;
  try {
    localStorage.setItem(CHAVE, JSON.stringify(m));
  } catch {
    // modo anônimo/sem espaço: o rascunho só vale enquanto a página estiver aberta
  }
  ouvintes.forEach((f) => f());
}

export function lerRascunho(jid: string): string {
  return ler()[jid]?.t ?? "";
}

export function salvarRascunho(jid: string, texto: string) {
  const atual = ler();
  if (!texto.trim()) {
    if (!(jid in atual)) return;
    const { [jid]: _, ...resto } = atual;
    gravar(resto);
    return;
  }
  if (atual[jid]?.t === texto) return;
  gravar({ ...atual, [jid]: { t: texto, em: Date.now() } });
}

function assinar(f: () => void) {
  ouvintes.add(f);
  // outra aba do portal salvou um rascunho
  const deFora = (e: StorageEvent) => {
    if (e.key !== CHAVE) return;
    cache = null;
    f();
  };
  window.addEventListener("storage", deFora);
  return () => {
    ouvintes.delete(f);
    window.removeEventListener("storage", deFora);
  };
}

/** Rascunho da conversa, para a linha da lista ("Rascunho: …"). */
export function useRascunho(jid: string): string {
  return useSyncExternalStore(
    assinar,
    () => lerRascunho(jid),
    () => ""
  );
}
