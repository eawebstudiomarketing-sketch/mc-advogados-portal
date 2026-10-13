"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { setAdvogadosDoClienteAction } from "@/app/admin/team/actions";

/** Só admin: quais advogados cuidam deste cliente (só eles o enxergam). */
export function EquipeDoCliente({
  clientId,
  equipe,
  designados,
}: {
  clientId: string;
  equipe: { id: string; nome: string; ativo: boolean }[];
  designados: string[];
}) {
  const [sel, setSel] = useState(new Set(designados));
  const [pending, start] = useTransition();
  const mudou = sel.size !== designados.length || designados.some((d) => !sel.has(d));

  function salvar() {
    start(async () => {
      const r = await setAdvogadosDoClienteAction(clientId, [...sel]);
      if (r.ok) toast.success("Advogados do cliente salvos.");
      else toast.error(r.error);
    });
  }

  return (
    <section className="ui-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title flex items-center gap-2">
          <Users className="h-4 w-4 text-muted" aria-hidden /> Advogados deste cliente
        </h2>
        {mudou && (
          <button type="button" onClick={salvar} disabled={pending} className="ui-btn px-3 py-1.5 text-xs">
            {pending ? "Salvando..." : "Salvar"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">
        Só os advogados marcados enxergam este cliente e tudo dele. Sem ninguém marcado, só o administrador vê.
      </p>
      {equipe.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Nenhum advogado na equipe ainda.{" "}
          <Link href="/admin/team/new" className="ui-link">
            Convidar advogado
          </Link>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {equipe.map((p) => {
            const on = sel.has(p.id);
            return (
              <label
                key={p.id}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on ? "border-navy-3/40 bg-navy/[0.06] text-foreground" : "border-border text-muted hover:border-border-strong"
                }`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    })
                  }
                  className="h-3.5 w-3.5 accent-[var(--navy)]"
                />
                {p.nome}
                {!p.ativo && <span className="text-[11px] text-muted">(desativado)</span>}
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}
