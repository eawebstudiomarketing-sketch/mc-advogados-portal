"use client";

import { useEffect, useRef } from "react";

/**
 * Volta a página para o topo quando `chave` muda: telas que trocam de
 * conteúdo no lugar (etapas da assinatura, gravação, progresso) abriam com a
 * página ainda rolada e o título ficava cortado lá em cima.
 */
export function useTopoAoTrocar(chave: unknown) {
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [chave]);
}
