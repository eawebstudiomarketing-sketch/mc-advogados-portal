"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Balão do assistente como janela: arrasta pelo cabeçalho e muda de tamanho
// por qualquer borda ou canto. Posição/tamanho ficam no localStorage. Só no
// computador (sm+); no celular continua em tela cheia.

export type Rect = { x: number; y: number; w: number; h: number };
type Direcao = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const CHAVE = "mc:assistente:janela";
export const MIN_W = 320;
export const MIN_H = 380;
const MARGEM = 8;
const maxW = () => Math.round(window.innerWidth * 0.9);
const maxH = () => Math.round(window.innerHeight * 0.9);
const telaGrande = () => window.innerWidth >= 640;

/** Mantém o tamanho dentro dos limites e a janela inteira dentro da tela. */
function encaixar(r: Rect): Rect {
  const w = Math.min(Math.max(r.w, MIN_W), maxW());
  const h = Math.min(Math.max(r.h, MIN_H), maxH());
  const x = Math.min(Math.max(r.x, MARGEM), window.innerWidth - w - MARGEM);
  const y = Math.min(Math.max(r.y, MARGEM), window.innerHeight - h - MARGEM);
  return { x, y, w, h };
}

function ler(): Rect | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
    return v && [v.x, v.y, v.w, v.h].every((n) => typeof n === "number") ? v : null;
  } catch {
    return null;
  }
}

function gravar(r: Rect | null) {
  try {
    if (r) localStorage.setItem(CHAVE, JSON.stringify(r));
    else localStorage.removeItem(CHAVE);
  } catch {}
}

export function useJanelaMovel(ativo: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mexendo, setMexendo] = useState(false);

  // ao abrir: posição salva (encaixada na tela atual)
  useEffect(() => {
    if (!ativo || !telaGrande()) return;
    const salvo = ler();
    if (!salvo) return;
    const id = requestAnimationFrame(() => setRect(encaixar(salvo)));
    return () => cancelAnimationFrame(id);
  }, [ativo]);

  // janela do navegador mudou de tamanho: continua dentro da tela
  useEffect(() => {
    if (!ativo) return;
    const ajustar = () => setRect((r) => (r && telaGrande() ? encaixar(r) : r));
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [ativo]);

  const iniciar = useCallback(
    (e: React.PointerEvent, mover: (inicio: Rect, dx: number, dy: number) => Rect) => {
      if (e.button !== 0 || !ref.current || !telaGrande()) return;
      e.preventDefault();
      const b = ref.current.getBoundingClientRect();
      const inicio: Rect = rect ?? { x: b.left, y: b.top, w: b.width, h: b.height };
      const px = e.clientX;
      const py = e.clientY;
      let ultimo = inicio;
      setMexendo(true);
      const selecao = document.body.style.userSelect;
      document.body.style.userSelect = "none";

      const move = (ev: PointerEvent) => {
        ultimo = mover(inicio, ev.clientX - px, ev.clientY - py);
        setRect(ultimo);
      };
      const fim = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", fim);
        window.removeEventListener("pointercancel", fim);
        document.body.style.userSelect = selecao;
        setMexendo(false);
        gravar(ultimo);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", fim);
      window.addEventListener("pointercancel", fim);
    },
    [rect]
  );

  /** Arrastar pelo cabeçalho (botões do cabeçalho continuam clicáveis). */
  const onArrastar = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input,textarea,select")) return;
    iniciar(e, (r, dx, dy) => encaixar({ ...r, x: r.x + dx, y: r.y + dy }));
  };

  /** Redimensionar por uma borda/canto; o lado oposto fica parado. */
  const onRedimensionar = (dir: Direcao) => (e: React.PointerEvent) =>
    iniciar(e, (r, dx, dy) => {
      let { x, y, w, h } = r;
      const direita = r.x + r.w;
      const baixo = r.y + r.h;
      if (dir.includes("e")) w = Math.min(Math.max(r.w + dx, MIN_W), maxW(), window.innerWidth - MARGEM - r.x);
      if (dir.includes("s")) h = Math.min(Math.max(r.h + dy, MIN_H), maxH(), window.innerHeight - MARGEM - r.y);
      if (dir.includes("w")) {
        w = Math.min(Math.max(r.w - dx, MIN_W), maxW(), direita - MARGEM);
        x = direita - w;
      }
      if (dir.includes("n")) {
        h = Math.min(Math.max(r.h - dy, MIN_H), maxH(), baixo - MARGEM);
        y = baixo - h;
      }
      return { x, y, w, h };
    });

  const restaurar = () => {
    setRect(null);
    gravar(null);
  };

  const estilo: React.CSSProperties | undefined =
    rect && typeof window !== "undefined" && telaGrande()
    ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h, right: "auto", bottom: "auto" }
    : undefined;

  return { ref, rect, estilo, mexendo, onArrastar, onRedimensionar, restaurar };
}

const ALCAS: { dir: Direcao; cls: string }[] = [
  { dir: "n", cls: "top-0 left-3 right-3 h-1.5 cursor-ns-resize" },
  { dir: "s", cls: "bottom-0 left-3 right-3 h-1.5 cursor-ns-resize" },
  { dir: "e", cls: "right-0 top-3 bottom-3 w-1.5 cursor-ew-resize" },
  { dir: "w", cls: "left-0 top-3 bottom-3 w-1.5 cursor-ew-resize" },
  { dir: "ne", cls: "top-0 right-0 h-3.5 w-3.5 cursor-nesw-resize" },
  { dir: "sw", cls: "bottom-0 left-0 h-3.5 w-3.5 cursor-nesw-resize" },
  { dir: "nw", cls: "top-0 left-0 h-3.5 w-3.5 cursor-nwse-resize" },
  { dir: "se", cls: "bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize" },
];

/** Alças invisíveis nas bordas e cantos (só no computador). */
export function AlcasRedimensionar({ onRedimensionar }: { onRedimensionar: (dir: Direcao) => (e: React.PointerEvent) => void }) {
  return (
    <>
      {ALCAS.map((a) => (
        <div key={a.dir} aria-hidden onPointerDown={onRedimensionar(a.dir)} className={`absolute z-20 touch-none max-sm:hidden ${a.cls}`} />
      ))}
    </>
  );
}
