"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { telaAnterior } from "@/lib/navegacao";

/**
 * Seta de voltar: leva para a tela de onde a pessoa veio (com a aba que estava
 * aberta). Sem trilha (link aberto direto), usa o `fallback`.
 */
export function BackButton({ fallback, className = "mb-2" }: { fallback: string; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <Link
      href={fallback}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        router.push(telaAnterior(pathname) ?? fallback);
      }}
      className={`icon-btn -ml-1.5 border border-border bg-surface ${className}`}
      aria-label="Voltar"
      data-tip="Voltar"
    >
      <ArrowLeft aria-hidden />
    </Link>
  );
}

/** Campo oculto return_to: o formulário volta para onde a pessoa estava. */
export function VoltarInput() {
  const pathname = usePathname();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.value = telaAnterior(pathname) ?? "";
  }, [pathname]);
  return <input ref={ref} type="hidden" name="return_to" defaultValue="" />;
}
