"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { registrarTela } from "@/lib/navegacao";

/** Grava cada tela visitada na trilha (ver lib/navegacao). */
export function NavTrail() {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  useEffect(() => {
    registrarTela(qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, qs]);
  return null;
}
