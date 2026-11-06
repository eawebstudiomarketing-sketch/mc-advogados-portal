"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Recarrega os números da tela a cada 30 s (só com a aba visível).
export function AtualizarSozinho({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}
