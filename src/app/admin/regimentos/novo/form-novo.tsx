"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { criarRegimentoAction } from "../actions";

// Novo regimento: cliente, segmento, nome e alguns dados → a IA monta o questionário.

const CAMPOS = [
  { id: "atividade", rotulo: "Atividade principal", ph: "Ex.: padaria com produção própria e cafeteria" },
  { id: "funcionarios", rotulo: "Quantidade de funcionários", ph: "Ex.: 29" },
  { id: "unidades", rotulo: "Unidades / filiais", ph: "Ex.: uma loja + depósito" },
  { id: "funcionamento", rotulo: "Horário de funcionamento", ph: "Ex.: seg a sáb 6h–20h, dom 6h–12h" },
  { id: "setores", rotulo: "Setores e funções", ph: "Ex.: caixa, balcão, padeiros, confeitaria, entregas" },
  { id: "problemas", rotulo: "O que a empresa quer resolver com o regimento", ph: "Ex.: atrasos, uso de celular, faltas sem aviso" },
  { id: "observacoes", rotulo: "Outras informações", ph: "Qualquer detalhe que ajude a personalizar as perguntas" },
] as const;

export function FormNovoRegimento({ clientes, clienteInicial }: { clientes: { id: string; name: string }[]; clienteInicial?: string }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clienteInicial ?? "");
  const [nome, setNome] = useState(clientes.find((c) => c.id === clienteInicial)?.name ?? "");
  const [segmento, setSegmento] = useState("");
  const [dados, setDados] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const campo = "mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm font-normal";

  return (
    <form
      className="ui-card space-y-5 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await criarRegimentoAction({ clientId, nome, segmento, dados });
          if (!r.ok) return void toast.error(r.error);
          toast.success("Questionário criado. Revise e copie o link.");
          router.push(`/admin/regimentos/${r.id}`);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-foreground">
          Cliente
          <select
            required
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              if (!nome) setNome(clientes.find((c) => c.id === e.target.value)?.name ?? "");
            }}
            className={campo}
          >
            <option value="">Escolha…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-foreground">
          Nome da empresa (como vai no título)
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </label>
        <label className="text-sm font-medium text-foreground sm:col-span-2">
          Segmento da empresa
          <input required value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex.: padaria e confeitaria; loja de equipamentos gastronômicos; clínica odontológica" className={campo} />
        </label>
        {CAMPOS.map((c) => (
          <label key={c.id} className={`text-sm font-medium text-foreground ${c.id === "problemas" || c.id === "observacoes" ? "sm:col-span-2" : ""}`}>
            {c.rotulo} <span className="font-normal text-muted">(opcional)</span>
            {c.id === "problemas" || c.id === "observacoes" ? (
              <textarea rows={2} value={dados[c.id] ?? ""} onChange={(e) => setDados((d) => ({ ...d, [c.id]: e.target.value }))} placeholder={c.ph} className={campo} />
            ) : (
              <input value={dados[c.id] ?? ""} onChange={(e) => setDados((d) => ({ ...d, [c.id]: e.target.value }))} placeholder={c.ph} className={campo} />
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-border pt-4">
        <button type="submit" disabled={pending} className="ui-btn">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Gerar questionário com IA
        </button>
        {pending && <span className="text-sm text-muted">Montando as seções e perguntas (cerca de 30 s)…</span>}
      </div>
    </form>
  );
}
