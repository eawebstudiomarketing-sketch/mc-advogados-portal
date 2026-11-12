"use client";

// Link do menu/abas que só pré-carrega a tela quando a pessoa aponta (mouse, foco ou toque).
// O <Link> padrão pré-carrega TODOS os itens visíveis ao abrir cada tela (~30 por página),
// e cada um roda o layout do admin no servidor; isso deixava as telas pesadas por vários segundos.
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Link>, "prefetch" | "href"> & { href: string };

export function LinkMenu({ href, onMouseEnter, onFocus, onTouchStart, ...rest }: Props) {
  const router = useRouter();
  const pre = () => router.prefetch(href);
  return (
    <Link
      href={href}
      prefetch={false}
      onMouseEnter={(e) => {
        pre();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        pre();
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        pre();
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
}
