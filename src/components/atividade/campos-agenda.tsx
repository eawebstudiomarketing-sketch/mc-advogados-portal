"use client";

import { useState } from "react";

export const CATEGORIAS = [
  { valor: "tarefa", rotulo: "Tarefa" },
  { valor: "prazo", rotulo: "Prazo processual" },
  { valor: "audiencia", rotulo: "Audiência" },
] as const;

// Categoria da atividade na Agenda + hora (a hora só aparece para audiência).
export function CamposAgenda({ categoria = "tarefa", hora }: { categoria?: string; hora?: string | null }) {
  const [cat, setCat] = useState(categoria);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="categoria" className="ui-label">
          Na agenda, é
        </label>
        <select id="categoria" name="categoria" value={cat} onChange={(e) => setCat(e.target.value)} className="ui-input">
          {CATEGORIAS.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.rotulo}
            </option>
          ))}
        </select>
      </div>
      {cat === "audiencia" ? (
        <div>
          <label htmlFor="hora" className="ui-label">
            Horário
          </label>
          <input id="hora" name="hora" type="time" defaultValue={hora?.slice(0, 5) ?? ""} className="ui-input" />
        </div>
      ) : (
        <input type="hidden" name="hora" value="" />
      )}
    </div>
  );
}
