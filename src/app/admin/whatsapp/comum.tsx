"use client";

import { memo, useState } from "react";
import { UserRound, Users } from "lucide-react";
import { iniciais } from "./util";

/** Foto da conversa (ou iniciais / ícone de grupo). */
export const AvatarWa = memo(function AvatarWa({ nome, grupo, foto, tamanho = "h-10 w-10" }: { nome: string; grupo: boolean; foto?: string | null; tamanho?: string }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt="" onError={() => setFalhou(true)} className={`${tamanho} shrink-0 rounded-full bg-surface-2 object-cover`} loading="lazy" decoding="async" />;
  }
  return (
    <span className={`flex ${tamanho} shrink-0 items-center justify-center rounded-full bg-navy-2 text-xs font-semibold text-navy-foreground`}>
      {grupo ? <Users className="h-4 w-4" aria-hidden /> : /\p{L}/u.test(nome) ? iniciais(nome) : <UserRound className="h-4 w-4" aria-hidden />}
    </span>
  );
});
