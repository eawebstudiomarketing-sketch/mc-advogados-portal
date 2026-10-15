"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { createResponsavelAction } from "@/app/admin/activities/modal-actions";
import type { Responsavel } from "@/lib/data/responsaveis";

const NOVO = "__novo__";

/**
 * Responsável da atividade: equipe com login ou pessoa cadastrada só com nome
 * e Gmail. A última opção abre um mini cadastro ali mesmo. Mostra primeiro
 * quem cuida da empresa e, separado, o resto da equipe: quem é de fora passa
 * a ver só esta atividade (regra do banco, migration 0022).
 */
export function ResponsavelSelect({
  responsaveis: inicial,
  defaultValue,
  id = "responsavel_id",
  clientId,
}: {
  responsaveis: Responsavel[];
  defaultValue?: string | null;
  id?: string;
  /** cliente da atividade: separa "Equipe desta empresa" de "Outros da equipe" */
  clientId?: string | null;
}) {
  const [lista, setLista] = useState(inicial);
  const [valor, setValor] = useState(defaultValue ?? inicial[0]?.id ?? "");
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const daEmpresa = (r: Responsavel) => !clientId || r.clientes === null || r.clientes.includes(clientId);
  const doCliente = lista.filter(daEmpresa);
  const outros = lista.filter((r) => !daEmpresa(r));
  const opcao = (r: Responsavel) => (
    <option key={r.id} value={r.id}>
      {r.nome}
      {r.temLogin ? "" : " (sem login)"}
    </option>
  );

  function cadastrar() {
    setErro(null);
    start(async () => {
      const r = await createResponsavelAction(nome, email);
      if (!r.ok) return setErro(r.error);
      setLista((l) => (l.some((x) => x.id === r.responsavel.id) ? l : [...l, r.responsavel].sort((a, b) => a.nome.localeCompare(b.nome))));
      setValor(r.responsavel.id);
      setCriando(false);
      setNome("");
      setEmail("");
    });
  }

  return (
    <div>
      <select
        id={id}
        name={criando ? undefined : "responsavel_id"}
        value={criando ? NOVO : valor}
        onChange={(e) => {
          if (e.target.value === NOVO) setCriando(true);
          else {
            setCriando(false);
            setValor(e.target.value);
          }
        }}
        className="ui-input"
      >
        {lista.length === 0 && <option value="">Ninguém cadastrado</option>}
        {outros.length > 0 ? (
          <>
            <optgroup label="Equipe desta empresa">{doCliente.map(opcao)}</optgroup>
            <optgroup label="Outros da equipe (veem só esta atividade)">{outros.map(opcao)}</optgroup>
          </>
        ) : (
          lista.map(opcao)
        )}
        <option value={NOVO}>+ Cadastrar responsável…</option>
      </select>
      {/* enquanto cadastra, o formulário continua mandando o último escolhido */}
      {criando && <input type="hidden" name="responsavel_id" value={valor} />}

      {criando && (
        <div className="mt-2 rounded-xl border border-border bg-surface-2 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
            <UserPlus className="h-3.5 w-3.5" aria-hidden /> Novo responsável (não precisa ter login no portal)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" aria-label="Nome do responsável" className="ui-input" />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  cadastrar();
                }
              }}
              type="email"
              placeholder="Gmail (recebe os avisos de prazo)"
              aria-label="Gmail do responsável"
              className="ui-input"
            />
          </div>
          {erro && <p className="mt-2 text-xs text-status-danger">{erro}</p>}
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={cadastrar} disabled={pending} className="ui-btn px-3 py-1.5 text-xs">
              {pending ? "Salvando..." : "Adicionar"}
            </button>
            <button type="button" onClick={() => setCriando(false)} className="ui-btn-secondary px-3 py-1.5 text-xs">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
