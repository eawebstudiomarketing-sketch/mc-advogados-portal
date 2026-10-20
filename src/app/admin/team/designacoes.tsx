"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Cada cliente fica com UMA pessoa só (pedido de 20/10). Os cartões da Equipe
// compartilham as escolhas (até as não salvas): marcou num, some dos outros.

type Ctx = {
  /** cliente → quem está com ele (id da pessoa) */
  dono: Map<string, string>;
  nomes: Map<string, string>;
  definir: (pessoaId: string, clientes: string[]) => void;
};

const DesignacoesCtx = createContext<Ctx | null>(null);

export function DesignacoesProvider({
  inicial,
  nomes,
  children,
}: {
  inicial: Record<string, string[]>;
  nomes: Record<string, string>;
  children: React.ReactNode;
}) {
  const [porPessoa, setPorPessoa] = useState<Record<string, string[]>>(inicial);
  const definir = useCallback((pessoaId: string, clientes: string[]) => {
    setPorPessoa((atual) => {
      const novo: Record<string, string[]> = {};
      for (const [p, cs] of Object.entries(atual)) novo[p] = p === pessoaId ? clientes : cs.filter((c) => !clientes.includes(c));
      if (!(pessoaId in novo)) novo[pessoaId] = clientes;
      return novo;
    });
  }, []);
  const valor = useMemo(() => {
    const dono = new Map<string, string>();
    for (const [p, cs] of Object.entries(porPessoa)) for (const c of cs) dono.set(c, p);
    return { dono, nomes: new Map(Object.entries(nomes)), definir };
  }, [porPessoa, nomes, definir]);
  return <DesignacoesCtx.Provider value={valor}>{children}</DesignacoesCtx.Provider>;
}

export function useDesignacoes() {
  return useContext(DesignacoesCtx);
}
