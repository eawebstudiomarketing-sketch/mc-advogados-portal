"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";
import { EtiquetaChip } from "@/components/atividade/etiquetas";
import { criarEtiquetaAction, editarEtiquetaAction, excluirEtiquetaAction } from "../etiquetas-actions";
import type { Etiqueta } from "@/lib/data/etiquetas";

const CORES = ["#2563eb", "#0369a1", "#0891b2", "#0d9488", "#16a34a", "#059669", "#ca8a04", "#b8892f", "#d97706", "#ea580c", "#dc2626", "#e11d48", "#db2777", "#9333ea", "#7c3aed", "#4f46e5", "#475569", "#64748b"];

function Linha({ e, usos, podeExcluir }: { e: Etiqueta; usos: number; podeExcluir: boolean }) {
  const router = useRouter();
  const [nome, setNome] = useState(e.nome);
  const [cor, setCor] = useState(e.cor);
  const [pending, start] = useTransition();
  const mudou = nome.trim() !== e.nome || cor !== e.cor;

  function salvar() {
    start(async () => {
      const r = await editarEtiquetaAction(e.id, nome, cor);
      if (r.ok) {
        toast.success("Etiqueta salva.");
        router.refresh();
      } else toast.error(r.error);
    });
  }
  function excluir() {
    if (!confirm(`Excluir a etiqueta "${e.nome}"?${usos ? ` Ela sai de ${usos} atividade(s).` : ""}`)) return;
    start(async () => {
      const r = await excluirEtiquetaAction(e.id);
      if (r.ok) {
        toast.success("Etiqueta excluída.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-border py-3">
      <div className="w-44 shrink-0">
        <EtiquetaChip e={{ ...e, nome: nome || e.nome, cor }} />
      </div>
      <input value={nome} onChange={(x) => setNome(x.target.value)} maxLength={60} aria-label="Nome" className="ui-input min-w-40 flex-1 !py-1.5 text-sm" />
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Cor">
        {CORES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={cor === c}
            aria-label={c}
            onClick={() => setCor(c)}
            className={`h-5 w-5 rounded-full transition-transform ${cor === c ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-surface" : "hover:scale-110"}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <span className="eyebrow w-20 text-right">{usos} uso{usos === 1 ? "" : "s"}</span>
      <button type="button" onClick={salvar} disabled={!mudou || pending} className="icon-btn" aria-label="Salvar" data-tip="Salvar">
        <Check aria-hidden />
      </button>
      {podeExcluir && (
        <button type="button" onClick={excluir} disabled={pending} className="icon-btn icon-btn-danger" aria-label="Excluir" data-tip="Excluir">
          <Trash2 aria-hidden />
        </button>
      )}
    </li>
  );
}

export function GerenciarEtiquetas({ etiquetas, contagem, podeExcluir }: { etiquetas: Etiqueta[]; contagem: Record<string, number>; podeExcluir: boolean }) {
  const router = useRouter();
  const [nova, setNova] = useState("");
  const [pending, start] = useTransition();

  function criar(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await criarEtiquetaAction(nova);
      if (r.ok) {
        setNova("");
        toast.success("Etiqueta criada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="mt-6">
      <form onSubmit={criar} className="mb-4 flex gap-2">
        <input value={nova} onChange={(e) => setNova(e.target.value)} maxLength={60} placeholder="Nova etiqueta" aria-label="Nova etiqueta" className="ui-input max-w-sm" />
        <button type="submit" disabled={!nova.trim() || pending} className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> Criar
        </button>
      </form>
      <ul className="ui-card border-b-0 px-4">
        {etiquetas.map((e) => (
          <Linha key={`${e.id}-${e.nome}-${e.cor}`} e={e} usos={contagem[e.id] ?? 0} podeExcluir={podeExcluir} />
        ))}
      </ul>
    </div>
  );
}
