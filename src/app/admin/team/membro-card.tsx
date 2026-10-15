"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { PERMISSOES, type Permissoes } from "@/lib/permissoes";
import { savePermissoesAction, setAtivoAction, setClientesDoAdvogadoAction } from "./actions";

const GRUPOS = [...new Set(PERMISSOES.map((p) => p.grupo))];

function Interruptor({ on, onChange, rotulo }: { on: boolean; onChange: (v: boolean) => void; rotulo: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={rotulo}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 ${on ? "bg-navy-3" : "bg-border-strong"}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-150 ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

/** Gerenciamento de um advogado: clientes que ele cuida, o que pode ver/fazer e acesso. */
export function MembroCard({
  membro,
  clientes,
  designados,
  permissoes,
  acoes,
}: {
  acoes?: React.ReactNode;
  membro: { id: string; nome: string; email: string; ativo: boolean };
  clientes: { id: string; name: string }[];
  designados: string[];
  permissoes: Permissoes;
}) {
  const [aberto, setAberto] = useState<"clientes" | "permissoes" | null>(null);
  const [sel, setSel] = useState(new Set(designados));
  const [perm, setPerm] = useState(permissoes);
  const [ativo, setAtivo] = useState(membro.ativo);
  const [busca, setBusca] = useState("");
  const [pending, start] = useTransition();

  const clientesMudaram = sel.size !== designados.length || designados.some((d) => !sel.has(d));
  const permMudou = PERMISSOES.some((p) => perm[p.chave] !== permissoes[p.chave]);
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t ? clientes.filter((c) => c.name.toLowerCase().includes(t)) : clientes;
  }, [busca, clientes]);
  const bloqueadas = PERMISSOES.filter((p) => !perm[p.chave]).length;

  function salvarClientes() {
    start(async () => {
      const r = await setClientesDoAdvogadoAction(membro.id, [...sel]);
      if (r.ok) toast.success(`Clientes de ${membro.nome} salvos.`);
      else toast.error(r.error);
    });
  }
  function salvarPermissoes() {
    start(async () => {
      const r = await savePermissoesAction(membro.id, perm);
      if (r.ok) toast.success(`Permissões de ${membro.nome} salvas.`);
      else toast.error(r.error);
    });
  }
  function alternarAtivo(v: boolean) {
    if (!v && !confirm(`Desativar o acesso de ${membro.nome}? Ele(a) não consegue mais entrar; nada é apagado.`)) return;
    start(async () => {
      const r = await setAtivoAction(membro.id, v);
      if (r.ok) {
        setAtivo(v);
        toast.success(v ? "Acesso reativado." : "Acesso desativado.");
      } else toast.error(r.error);
    });
  }

  return (
    <div className={`ui-card overflow-hidden ${ativo ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy/[0.07] text-sm font-semibold text-navy-3">
          {membro.nome.replace(/^(Dr\.?|Dra\.?)\s+/i, "").slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">
            {membro.nome} {!ativo && <span className="ml-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">Desativado</span>}
          </p>
          <p className="truncate text-xs text-muted">
            {membro.email} · Advogado(a) · {sel.size} {sel.size === 1 ? "cliente" : "clientes"}
            {bloqueadas ? ` · ${bloqueadas} ${bloqueadas === 1 ? "bloqueio" : "bloqueios"}` : ""}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          Acesso
          <Interruptor on={ativo} onChange={alternarAtivo} rotulo={`Acesso de ${membro.nome}`} />
        </label>
        {acoes}
      </div>

      <div className="flex border-t border-border">
        {([
          ["clientes", "Clientes", Users],
          ["permissoes", "O que pode ver e fazer", ShieldCheck],
        ] as const).map(([id, rotulo, Icone]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAberto((a) => (a === id ? null : id))}
            aria-expanded={aberto === id}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-sm transition-colors ${
              aberto === id ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:bg-surface-2/60 hover:text-foreground"
            }`}
          >
            <Icone className="h-4 w-4" aria-hidden />
            {rotulo}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${aberto === id ? "rotate-180" : ""}`} aria-hidden />
          </button>
        ))}
      </div>

      {aberto === "clientes" && (
        <div className="border-t border-border bg-surface-2/40 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" className="ui-input pl-8" />
            </div>
            <button type="button" onClick={() => setSel(new Set([...sel, ...filtrados.map((c) => c.id)]))} className="ui-btn-secondary px-3 py-1.5 text-xs">
              Marcar {busca ? "os filtrados" : "todos"}
            </button>
            <button type="button" onClick={() => setSel(new Set([...sel].filter((id) => !filtrados.some((c) => c.id === id))))} className="ui-btn-secondary px-3 py-1.5 text-xs">
              Desmarcar {busca ? "os filtrados" : "todos"}
            </button>
          </div>
          <div className="mt-3 grid max-h-72 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {filtrados.length === 0 && <p className="text-sm text-muted">Nenhum cliente encontrado.</p>}
            {filtrados.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface">
                <input
                  type="checkbox"
                  checked={sel.has(c.id)}
                  onChange={() =>
                    setSel((s) => {
                      const n = new Set(s);
                      if (n.has(c.id)) n.delete(c.id);
                      else n.add(c.id);
                      return n;
                    })
                  }
                  className="h-4 w-4 accent-[var(--navy)]"
                />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">Ele(a) só enxerga os clientes marcados, com as atividades, documentos e processos deles.</p>
            <button type="button" onClick={salvarClientes} disabled={!clientesMudaram || pending} className="ui-btn px-4 py-2 text-sm">
              {pending ? "Salvando..." : "Salvar clientes"}
            </button>
          </div>
        </div>
      )}

      {aberto === "permissoes" && (
        <div className="border-t border-border bg-surface-2/40 px-5 py-4">
          <p className="text-xs text-muted">Financeiro, Equipe, Integrações e Lixeira nunca aparecem para advogado.</p>
          <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {GRUPOS.map((g) => (
              <div key={g}>
                <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted uppercase">{g}</p>
                <ul className="space-y-1">
                  {PERMISSOES.filter((p) => p.grupo === g).map((p) => (
                    <li key={p.chave} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-surface">
                      <span className="text-sm text-foreground">{p.rotulo}</span>
                      <Interruptor on={perm[p.chave]} onChange={(v) => setPerm((x) => ({ ...x, [p.chave]: v }))} rotulo={p.rotulo} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={salvarPermissoes} disabled={!permMudou || pending} className="ui-btn px-4 py-2 text-sm">
              {pending ? "Salvando..." : "Salvar permissões"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
