"use client";

import { useEffect, useRef, useState } from "react";
import { Great_Vibes } from "next/font/google";
import { Eraser, PenLine, Type } from "lucide-react";

// Assinatura como na ZapSign: desenhar com o dedo/mouse ou digitar o nome
// em letra cursiva. Sai um PNG transparente, recortado no traço.

const cursiva = Great_Vibes({ weight: "400", subsets: ["latin"], display: "swap" });

export type AssinaturaFeita = { png: string; tipo: "desenho" | "digitada" } | null;

/** Recorta o canvas no que foi desenhado (com uma margem) e devolve PNG. */
function recortar(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const m = 8;
  const sx = Math.max(0, x0 - m),
    sy = Math.max(0, y0 - m);
  const sw = Math.min(w, x1 + m) - sx,
    sh = Math.min(h, y1 + m) - sy;
  const out = document.createElement("canvas");
  // no máximo 600 px de largura: arquivo leve
  const escala = Math.min(1, 600 / sw);
  out.width = Math.round(sw * escala);
  out.height = Math.round(sh * escala);
  out.getContext("2d")!.drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

export function AssinaturaPad({ nome, onChange }: { nome: string; onChange: (a: AssinaturaFeita) => void }) {
  const [modo, setModo] = useState<"desenho" | "digitada">("desenho");
  const [texto, setTexto] = useState(nome);
  const [temTraco, setTemTraco] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);

  // prepara o canvas na resolução da tela
  useEffect(() => {
    const c = canvas.current;
    if (!c || modo !== "desenho") return;
    const r = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f1b2d";
    ctx.lineWidth = 2.4;
  }, [modo]);

  // nome digitado → PNG em letra cursiva
  useEffect(() => {
    if (modo !== "digitada") return;
    let vivo = true;
    const t = setTimeout(async () => {
      const nomeLimpo = texto.trim();
      if (!nomeLimpo) return onChange(null);
      const familia = cursiva.style.fontFamily;
      await document.fonts.load(`96px ${familia}`).catch(() => {});
      if (!vivo) return;
      const c = document.createElement("canvas");
      c.width = 1400;
      c.height = 260;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#0f1b2d";
      let tam = 120;
      ctx.font = `${tam}px ${familia}`;
      while (ctx.measureText(nomeLimpo).width > 1340 && tam > 40) ctx.font = `${(tam -= 6)}px ${familia}`;
      ctx.textBaseline = "middle";
      ctx.fillText(nomeLimpo, 30, 130);
      const png = recortar(c);
      onChange(png ? { png, tipo: "digitada" } : null);
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onChange muda a cada render do pai
  }, [texto, modo]);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function inicio(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    desenhando.current = true;
    ultimo.current = ponto(e);
    const ctx = e.currentTarget.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(ultimo.current.x, ultimo.current.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = "#0f1b2d";
    ctx.fill();
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current || !ultimo.current) return;
    const p = ponto(e);
    const ctx = e.currentTarget.getContext("2d")!;
    const meio = { x: (ultimo.current.x + p.x) / 2, y: (ultimo.current.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(ultimo.current.x, ultimo.current.y);
    ctx.quadraticCurveTo(ultimo.current.x, ultimo.current.y, meio.x, meio.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ultimo.current = p;
  }
  function fim() {
    if (!desenhando.current) return;
    desenhando.current = false;
    const png = canvas.current ? recortar(canvas.current) : null;
    setTemTraco(!!png);
    onChange(png ? { png, tipo: "desenho" } : null);
  }
  function limpar() {
    const c = canvas.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setTemTraco(false);
    onChange(null);
  }

  return (
    <div>
      <div className="mb-2 inline-flex rounded-lg p-0.5 ring-1 ring-slate-300" role="tablist">
        {(
          [
            ["desenho", "Desenhar", PenLine],
            ["digitada", "Digitar", Type],
          ] as const
        ).map(([id, rotulo, Icone]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={modo === id}
            onClick={() => {
              setModo(id);
              setTemTraco(false);
              onChange(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${modo === id ? "bg-[#11273b] text-white" : "text-slate-600"}`}
          >
            <Icone className="h-3.5 w-3.5" aria-hidden /> {rotulo}
          </button>
        ))}
      </div>
      {modo === "desenho" ? (
        <div className="relative">
          <canvas
            ref={canvas}
            onPointerDown={inicio}
            onPointerMove={move}
            onPointerUp={fim}
            onPointerLeave={fim}
            className="h-40 w-full touch-none rounded-xl bg-white ring-1 ring-slate-300"
            aria-label="Área para desenhar a assinatura"
          />
          <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-slate-300" aria-hidden />
          {!temTraco && <p className="pointer-events-none absolute inset-x-0 top-14 text-center text-sm text-slate-400">Assine aqui com o dedo ou o mouse</p>}
          {temTraco && (
            <button type="button" onClick={limpar} className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
              <Eraser className="h-3.5 w-3.5" aria-hidden /> Limpar
            </button>
          )}
        </div>
      ) : (
        <div>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={80} className="w-full rounded-xl px-3 py-2.5 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-[#11273b] focus:outline-none" aria-label="Nome para a assinatura" />
          <div className="mt-2 flex h-28 items-center overflow-hidden rounded-xl bg-white px-5 ring-1 ring-slate-300">
            <span className={`${cursiva.className} truncate text-5xl text-[#0f1b2d]`}>{texto || " "}</span>
          </div>
        </div>
      )}
    </div>
  );
}
