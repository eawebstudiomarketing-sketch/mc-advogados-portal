"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { setAdvogadosDoClienteAction } from "@/app/admin/team/actions";

/**
 * Só o admin máximo: quem cuida deste cliente. Cada cliente fica com UMA
 * pessoa (pedido de 20/10); escolher outra tira da anterior.
 */
export function EquipeDoCliente({
  clientId,
  equipe,
  designados,
}: {
  clientId: string;
  equipe: { id: string; nome: string; ativo: boolean }[];
  designados: string[];
}) {
  const inicial = designados[0] ?? "";
  const [sel, setSel] = useState(inicial);
  const [salvo, setSalvo] = useState(inicial);
  const [pending, start] = useTransition();

  function salvar() {
    start(async () => {
      const r = await setAdvogadosDoClienteAction(clientId, sel ? [sel] : []);
      if (r.ok) {
        setSalvo(sel);
        toast.success(sel ? `Agora ${equipe.find((p) => p.id === sel)?.nome ?? "a pessoa"} cuida deste cliente.` : "Cliente sem responsável fixo.");
      } else toast.error(r.error);
    });
  }

  const opcoes = [{ id: "", nome: "Ninguém (só o admin vê)", ativo: true }, ...equipe];

  return (
    <section className="ui-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title flex items-center gap-2">
          <Users className="h-4 w-4 text-muted" aria-hidden /> Quem cuida deste cliente
        </h2>
        {sel !== salvo && (
          <button type="button" onClick={salvar} disabled={pending} className="ui-btn px-3 py-1.5 text-xs">
            {pending ? "Salvando..." : "Salvar"}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">Cada cliente fica com uma pessoa só. Ela enxerga o cliente e tudo dele; quem tem &ldquo;Ver todos os clientes&rdquo; também vê.</p>
      {equipe.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Ninguém na equipe ainda.{" "}
          <Link href="/admin/team/new" className="ui-link">
            Convidar pessoa
          </Link>
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Quem cuida deste cliente">
          {opcoes.map((p) => {
            const on = sel === p.id;
            return (
              <label
                key={p.id || "ninguem"}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  on ? "border-navy-3/40 bg-navy/[0.06] text-foreground" : "border-border text-muted hover:border-border-strong"
                }`}
              >
                <input type="radio" name={`cuida-${clientId}`} checked={on} onChange={() => setSel(p.id)} className="h-3.5 w-3.5 accent-[var(--navy)]" />
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
