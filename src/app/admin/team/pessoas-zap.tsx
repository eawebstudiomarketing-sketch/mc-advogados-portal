"use client";

import { useState, useTransition } from "react";
import { MessageCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { Pessoa } from "@/lib/data/escritorio";
import { salvarAreasEscritorioAction, salvarPessoaAction } from "./actions";
import { FotoPerfil } from "@/components/ui/foto-perfil";

// Pessoas da equipe (com e sem login): WhatsApp de cada um (rotina das 8h e
// lembretes), áreas de atuação (sugestão de responsável na Distribuição).

const PAPEL: Record<string, string> = { admin: "Administrador", advogado: "Advogado(a)" };

function formatarTel(t: string | null) {
  const d = (t ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ?? "";
}

export function LinhaPessoa({ pessoa, areas }: { pessoa: Pessoa; areas: string[] }) {
  const [tel, setTel] = useState(formatarTel(pessoa.telefone));
  const [sel, setSel] = useState<string[]>(pessoa.areas);
  const [rotina, setRotina] = useState(pessoa.rotinaZap);
  const [pending, start] = useTransition();
  const mudou =
    tel.replace(/\D/g, "") !== (pessoa.telefone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "") ||
    rotina !== pessoa.rotinaZap ||
    sel.length !== pessoa.areas.length ||
    sel.some((a) => !pessoa.areas.includes(a));

  function salvar() {
    start(async () => {
      const r = await salvarPessoaAction(pessoa.id, { telefone: tel, areas: sel, rotinaZap: rotina });
      if (r.ok) toast.success(`${pessoa.nome}: salvo.`);
      else toast.error(r.error);
    });
  }

  return (
    <li className="ui-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <FotoPerfil responsavelId={pessoa.id} nome={pessoa.nome} foto={pessoa.foto} tamanho={44} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground">{pessoa.nome}</p>
          <p className="truncate text-xs text-muted">
            {pessoa.email} · {pessoa.papel ? PAPEL[pessoa.papel] : "Sem login (só responsável)"}
          </p>
        </div>
        <label className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted" aria-hidden />
          <input
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            onBlur={() => setTel(formatarTel(tel))}
            placeholder="WhatsApp (DDD + número)"
            aria-label={`WhatsApp de ${pessoa.nome}`}
            inputMode="tel"
            className="ui-input w-48 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted" title="Recebe a agenda do dia no WhatsApp às 8h (dias úteis)">
          <input type="checkbox" checked={rotina} onChange={(e) => setRotina(e.target.checked)} className="h-4 w-4 accent-[var(--navy)]" />
          Rotina das 8h no Zap
        </label>
        <button type="button" onClick={salvar} disabled={!mudou || pending} className="ui-btn px-3 py-1.5 text-xs">
          {pending ? "Salvando..." : "Salvar"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-medium tracking-wide text-muted uppercase">Áreas</span>
        {areas.map((a) => {
          const on = sel.includes(a);
          return (
            <button
              key={a}
              type="button"
              aria-pressed={on}
              onClick={() => setSel((s) => (on ? s.filter((x) => x !== a) : [...s, a]))}
              className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                on ? "border-navy-3 bg-navy-3 text-white" : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {a}
            </button>
          );
        })}
        {sel
          .filter((a) => !areas.includes(a))
          .map((a) => (
            <span key={a} className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted" title="Área que não está mais na lista do escritório">
              {a}
            </span>
          ))}
      </div>
    </li>
  );
}

export function EditorAreas({ areas }: { areas: string[] }) {
  const [lista, setLista] = useState(areas);
  const [nova, setNova] = useState("");
  const [pending, start] = useTransition();
  const mudou = lista.join("|") !== areas.join("|");

  function adicionar() {
    const n = nova.trim();
    if (!n || lista.some((a) => a.toLowerCase() === n.toLowerCase())) return;
    setLista([...lista, n]);
    setNova("");
  }
  function salvar() {
    start(async () => {
      const r = await salvarAreasEscritorioAction(lista);
      if (r.ok) toast.success("Áreas salvas.");
      else toast.error(r.error);
    });
  }

  return (
    <div className="ui-card p-4">
      <p className="text-sm font-medium text-foreground">Áreas de atuação do escritório</p>
      <p className="text-xs text-muted">Cada demanda que chega recebe uma destas áreas, e o sistema sugere quem é da área como responsável.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {lista.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pr-1 pl-2.5 text-xs text-foreground">
            {a}
            <button type="button" onClick={() => setLista(lista.filter((x) => x !== a))} aria-label={`Tirar ${a}`} className="rounded-full p-0.5 text-muted hover:bg-border hover:text-foreground">
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Nova área"
          aria-label="Nova área"
          className="ui-input w-56 py-1.5 text-sm"
        />
        <button type="button" onClick={adicionar} className="ui-btn-secondary px-3 py-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar
        </button>
        <button type="button" onClick={salvar} disabled={!mudou || pending} className="ui-btn ml-auto px-3 py-1.5 text-xs">
          {pending ? "Salvando..." : "Salvar áreas"}
        </button>
      </div>
    </div>
  );
}

export function PessoasZap({ pessoas, areas }: { pessoas: Pessoa[]; areas: string[] }) {
  return (
    <div className="space-y-4">
      <EditorAreas areas={areas} />
      <ul className="space-y-2">
        {pessoas.map((p) => (
          <LinhaPessoa key={p.id} pessoa={p} areas={areas} />
        ))}
      </ul>
    </div>
  );
}
