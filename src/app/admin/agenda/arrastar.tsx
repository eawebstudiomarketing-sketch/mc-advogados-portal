"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { remarcarNaAgendaAction } from "./actions";

// Arrastar e soltar na agenda do mês (item 23): pega o item e solta em outro dia.

type Carga = { tipo: "atividade" | "compromisso"; id: string; dia: string };
const MIME = "application/x-mc-agenda";

/** Item que pode ser arrastado (prazo, tarefa, audiência ou compromisso). */
export function ItemArrastavel({ carga, children }: { carga: Carga; children: React.ReactNode }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME, JSON.stringify(carga));
        e.dataTransfer.effectAllowed = "move";
      }}
      className="cursor-grab active:cursor-grabbing"
    >
      {children}
    </div>
  );
}

/** Célula do dia que recebe o item solto e remarca. */
export function DiaAlvo({ dia, className, children }: { dia: string; className: string; children: React.ReactNode }) {
  const router = useRouter();
  const [por, setPor] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setPor(true);
      }}
      onDragLeave={() => setPor(false)}
      onDrop={(e) => {
        setPor(false);
        const cru = e.dataTransfer.getData(MIME);
        if (!cru) return;
        e.preventDefault();
        const c = JSON.parse(cru) as Carga;
        if (c.dia === dia) return;
        start(async () => {
          const r = await remarcarNaAgendaAction(c.tipo, c.id, dia);
          if (!r.ok) return void toast.error(r.error);
          toast.success(`Remarcado para ${dia.split("-").reverse().join("/")}`);
          router.refresh();
        });
      }}
      className={`${className} transition-colors ${por ? "bg-navy/[0.07] ring-2 ring-navy-3 ring-inset" : ""} ${pending ? "opacity-60" : ""}`}
    >
      {children}
    </div>
  );
}
