"use client";

import type { Pergunta, Resposta } from "@/lib/regimentos/tipos";

// Uma pergunta do Regimento no estilo do Google Forms (cartão com a pergunta e
// o campo do tipo certo). Usado no link público e na prévia do portal.

const PREFIXO_OUTRO = "Outro: ";

export function CampoPergunta({ p, valor, onChange, desabilitado }: { p: Pergunta; valor: Resposta | undefined; onChange: (v: Resposta) => void; desabilitado?: boolean }) {
  const texto = typeof valor === "string" ? valor : "";
  const lista = Array.isArray(valor) ? valor : [];
  const base = "w-full border-0 border-b border-border bg-transparent px-0 py-1.5 text-sm text-foreground focus:border-b-2 focus:border-navy focus:ring-0 focus:outline-none disabled:opacity-70";
  const nomeGrupo = `p-${p.id}`;

  let campo: React.ReactNode;
  if (p.tipo === "curta") campo = <input value={texto} disabled={desabilitado} onChange={(e) => onChange(e.target.value)} placeholder="Sua resposta" className={`${base} sm:w-1/2`} />;
  else if (p.tipo === "data") campo = <input type="date" value={texto} disabled={desabilitado} onChange={(e) => onChange(e.target.value)} className={`${base} w-48`} />;
  else if (p.tipo === "hora") campo = <input value={texto} disabled={desabilitado} onChange={(e) => onChange(e.target.value)} placeholder="Ex.: 08h às 17h (seg a sex)" className={`${base} sm:w-1/2`} />;
  else if (p.tipo === "multipla") {
    const outroAtivo = texto.startsWith(PREFIXO_OUTRO) || (!!texto && !p.opcoes?.includes(texto));
    campo = (
      <div className="space-y-2.5" role="radiogroup" aria-label={p.texto}>
        {p.opcoes?.map((o) => (
          <label key={o} className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="radio" name={nomeGrupo} checked={texto === o} disabled={desabilitado} onChange={() => onChange(o)} className="h-4 w-4 accent-navy" />
            {o}
          </label>
        ))}
        {p.outro && (
          <label className="flex items-center gap-3 text-sm">
            <input type="radio" name={nomeGrupo} checked={outroAtivo} disabled={desabilitado} onChange={() => onChange(PREFIXO_OUTRO)} className="h-4 w-4 accent-navy" />
            Outro:
            <input
              value={outroAtivo ? texto.replace(PREFIXO_OUTRO, "") : ""}
              disabled={desabilitado}
              onChange={(e) => onChange(PREFIXO_OUTRO + e.target.value)}
              aria-label="Outro"
              className={`${base} flex-1`}
            />
          </label>
        )}
        {texto && !desabilitado && (
          <button type="button" onClick={() => onChange("")} className="text-xs text-muted hover:text-foreground">
            Limpar seleção
          </button>
        )}
      </div>
    );
  } else if (p.tipo === "caixas") {
    const outro = lista.find((x) => x.startsWith(PREFIXO_OUTRO));
    const alternar = (o: string, on: boolean) => onChange(on ? [...lista, o] : lista.filter((x) => x !== o));
    campo = (
      <div className="space-y-2.5">
        {p.opcoes?.map((o) => (
          <label key={o} className="flex cursor-pointer items-center gap-3 text-sm">
            <input type="checkbox" checked={lista.includes(o)} disabled={desabilitado} onChange={(e) => alternar(o, e.target.checked)} className="h-4 w-4 accent-navy" />
            {o}
          </label>
        ))}
        {p.outro && (
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={outro !== undefined}
              disabled={desabilitado}
              onChange={(e) => onChange(e.target.checked ? [...lista, PREFIXO_OUTRO] : lista.filter((x) => !x.startsWith(PREFIXO_OUTRO)))}
              className="h-4 w-4 accent-navy"
            />
            Outro:
            <input
              value={outro?.replace(PREFIXO_OUTRO, "") ?? ""}
              disabled={desabilitado}
              onChange={(e) => onChange([...lista.filter((x) => !x.startsWith(PREFIXO_OUTRO)), PREFIXO_OUTRO + e.target.value])}
              aria-label="Outro"
              className={`${base} flex-1`}
            />
          </label>
        )}
      </div>
    );
  } else
    campo = (
      <textarea
        value={texto}
        disabled={desabilitado}
        onChange={(e) => onChange(e.target.value)}
        onInput={(e) => {
          const t = e.currentTarget;
          t.style.height = "auto";
          t.style.height = `${t.scrollHeight}px`;
        }}
        rows={1}
        placeholder="Sua resposta"
        className={`${base} resize-none`}
      />
    );

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <p className="text-[15px] leading-snug text-foreground">
        {p.texto}
        {p.obrigatoria && <span className="ml-1 text-status-danger">*</span>}
      </p>
      {p.ajuda && <p className="mt-1 text-xs text-muted">{p.ajuda}</p>}
      <div className="mt-4">{campo}</div>
    </div>
  );
}

/** Resposta em texto para mostrar/imprimir. */
export function respostaEmTexto(v: Resposta | undefined): string {
  if (Array.isArray(v)) return v.filter((x) => x.trim() && x !== PREFIXO_OUTRO).join("; ");
  return v && v !== PREFIXO_OUTRO ? v : "";
}
