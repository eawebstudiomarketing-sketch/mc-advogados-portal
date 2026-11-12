"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

// Campo de cliente com busca: digita parte do nome e a lista filtra (ignora acento).
// Envia o id num <input type="hidden" name={name}>, igual ao <select> que substitui.
type Opcao = { id: string; name: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function SeletorCliente({
  clients,
  name = "client_id",
  id,
  inicial,
  obrigatorio = true,
  vazio,
  onChange,
  className = "",
}: {
  clients: Opcao[];
  name?: string;
  id?: string;
  inicial?: string | null;
  obrigatorio?: boolean;
  /** rótulo da opção "nenhum cliente" (só quando não é obrigatório) */
  vazio?: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  const autoId = useId();
  const campoId = id ?? `cli-${autoId}`;
  const listaId = `${campoId}-lista`;
  const primeiro = clients.find((c) => c.id === inicial) ?? null;
  const [sel, setSel] = useState<Opcao | null>(primeiro);
  const [texto, setTexto] = useState(primeiro?.name ?? "");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  // texto digitado sem escolher da lista não vale: o formulário avisa em vez de enviar vazio
  useEffect(() => {
    campo.current?.setCustomValidity(obrigatorio && !sel ? "Escolha um cliente da lista" : "");
  }, [sel, obrigatorio]);

  const filtrados = useMemo(() => {
    const t = norm(texto.trim());
    if (!t || (sel && texto === sel.name)) return clients;
    return clients.filter((c) => norm(c.name).includes(t));
  }, [clients, texto, sel]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
        setTexto(sel?.name ?? "");
      }
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [sel]);

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  const escolher = (c: Opcao | null) => {
    setSel(c);
    setTexto(c?.name ?? "");
    setAberto(false);
    onChange?.(c?.id ?? "");
  };

  return (
    <div ref={caixa} className={`relative ${className}`}>
      <input type="hidden" name={name} value={sel?.id ?? ""} />
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={campo}
          id={campoId}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-autocomplete="list"
          autoComplete="off"
          className="ui-input pr-16 pl-9"
          placeholder="Digite parte do nome do cliente"
          value={texto}
          required={obrigatorio && !sel}
          onFocus={(e) => {
            setAberto(true);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
            setAtivo(0);
            if (sel && e.target.value !== sel.name) {
              setSel(null);
              onChange?.("");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAberto(true);
              setAtivo((a) => Math.min(a + 1, filtrados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && aberto) {
              e.preventDefault();
              if (filtrados[ativo]) escolher(filtrados[ativo]);
            } else if (e.key === "Escape") {
              setAberto(false);
              setTexto(sel?.name ?? "");
            }
          }}
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
          {sel && !obrigatorio && (
            <button type="button" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground" aria-label="Tirar o cliente" title="Tirar o cliente" onClick={() => escolher(null)}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
          <button type="button" tabIndex={-1} className="rounded p-1 text-muted hover:text-foreground" aria-label="Ver todos os clientes" title="Ver todos os clientes" onClick={() => setAberto((a) => !a)}>
            <ChevronDown className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      {aberto && (
        <ul ref={lista} id={listaId} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
          {!obrigatorio && (
            <li role="option" aria-selected={!sel} className="cursor-pointer px-3 py-1.5 text-sm text-muted hover:bg-[var(--hover)]" onMouseDown={(e) => { e.preventDefault(); escolher(null); }}>
              {vazio ?? "Sem cliente"}
            </li>
          )}
          {filtrados.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nenhum cliente com esse nome.</li>}
          {filtrados.map((c, i) => (
            <li
              key={c.id}
              data-i={i}
              role="option"
              aria-selected={sel?.id === c.id}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === ativo ? "bg-[var(--hover)]" : ""} ${sel?.id === c.id ? "font-semibold text-foreground" : "text-foreground/85"}`}
              onMouseEnter={() => setAtivo(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(c);
              }}
            >
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
