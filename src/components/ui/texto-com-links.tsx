"use client";

import { Fragment } from "react";

// Transforma http(s)://… e www.… em link clicável (abre em outra aba); o resto fica texto puro.
const RE = /((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])/gi;

export function TextoComLinks({ texto, className = "underline underline-offset-2 break-all hover:opacity-80" }: { texto: string; className?: string }) {
  if (!texto || !/(https?:\/\/|www\.)/i.test(texto)) return <>{texto}</>;
  const partes = texto.split(RE);
  return (
    <>
      {partes.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p.startsWith("http") ? p : `https://${p}`} target="_blank" rel="noopener noreferrer" className={className} onClick={(e) => e.stopPropagation()}>
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        )
      )}
    </>
  );
}
