"use client";

import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { enviarFotoAction } from "@/app/admin/fotos/actions";

/** Foto clicável: escolhe a imagem e já envia. */
export function FotoPerfil({ responsavelId, nome, foto, tamanho = 48 }: { responsavelId: string; nome: string; foto: string | null; tamanho?: number }) {
  const [atual, setAtual] = useState(foto);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function enviar(arquivo: File) {
    const fd = new FormData();
    fd.set("responsavel_id", responsavelId);
    fd.set("foto", arquivo);
    start(async () => {
      const r = await enviarFotoAction(fd);
      if (r.ok) {
        setAtual(r.url);
        toast.success("Foto atualizada.");
      } else toast.error(r.error);
    });
  }

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      disabled={pending}
      aria-label={`Trocar foto de ${nome}`}
      className="group relative shrink-0 rounded-full"
      style={{ width: tamanho, height: tamanho }}
    >
      <Avatar nome={nome} foto={atual} tamanho={tamanho} className={pending ? "opacity-50" : ""} />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-navy-2/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <Camera className="h-4 w-4" aria-hidden />
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar(f);
          e.target.value = "";
        }}
      />
    </button>
  );
}
