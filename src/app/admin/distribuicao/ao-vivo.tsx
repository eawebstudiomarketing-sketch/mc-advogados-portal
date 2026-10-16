"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Recarrega a lista quando chega (ou muda) uma demanda na Distribuição. */
export function DistribuicaoAoVivo() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel("distribuicao-ao-vivo")
      .on("postgres_changes", { event: "*", schema: "public", table: "distribuicao" }, () => {
        clearTimeout(timer);
        timer = setTimeout(() => router.refresh(), 600);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(canal);
    };
  }, [router]);
  return null;
}
