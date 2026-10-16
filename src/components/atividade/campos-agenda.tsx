"use client";

import { useState } from "react";

export const CATEGORIAS = [
  { valor: "tarefa", rotulo: "Tarefa" },
  { valor: "prazo", rotulo: "Prazo processual" },
  { valor: "audiencia", rotulo: "Audiência" },
] as const;

// Categoria da atividade na Agenda + hora (a hora só aparece para audiência)
// + área de atuação (quando a lista de áreas do escritório vem junto).
export function CamposAgenda({
  categoria = "tarefa",
  hora,
  areas,
  area,
}: {
  categoria?: string;
  hora?: string | null;
  areas?: string[];
  area?: string | null;
}) {
  const [cat, setCat] = useState(categoria);
  return (
    <div className={`grid grid-cols-1 gap-4 ${areas ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {areas && (
        <div>
          <label htmlFor="area" className="ui-label">
            Área
          </label>
          <select id="area" name="area" defaultValue={area ?? ""} className="ui-input">
            <option value="">Sem área</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            {area && !areas.includes(area) && <option value={area}>{area}</option>}
          </select>
        </div>
      )}
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
