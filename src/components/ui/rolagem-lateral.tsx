"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Rolagem para o lado com a barra EM CIMA (não precisa descer até o fim do
 * quadro pra arrastar). As duas barras andam juntas; a de baixo fica escondida.
 */
export function RolagemLateral({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const cima = useRef<HTMLDivElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  const [precisa, setPrecisa] = useState(false);

  useEffect(() => {
    const el = corpo.current;
    if (!el) return;
    const medir = () => {
      setLargura(el.scrollWidth);
      setPrecisa(el.scrollWidth > el.clientWidth + 1);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    for (const filho of Array.from(el.children)) ro.observe(filho);
    return () => ro.disconnect();
  }, []);

  const sincronizando = useRef(false);
  const espelhar = (de: HTMLDivElement | null, para: HTMLDivElement | null) => {
    if (!de || !para || sincronizando.current) return;
    sincronizando.current = true;
    para.scrollLeft = de.scrollLeft;
    requestAnimationFrame(() => (sincronizando.current = false));
  };

  return (
    <div>
      {precisa && (
        <div ref={cima} onScroll={() => espelhar(cima.current, corpo.current)} className="mb-2 overflow-x-auto overflow-y-hidden" aria-hidden>
          <div style={{ width: largura, height: 1 }} />
        </div>
      )}
      <div ref={corpo} onScroll={() => espelhar(corpo.current, cima.current)} className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
        {children}
      </div>
    </div>
  );
}
