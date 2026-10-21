import { segmentosAstrea } from "@/lib/astrea/texto";

/** Texto de andamento/publicação no formato do Astrea: mesmas quebras de linha e nome pesquisado destacado. */
export function TextoAstrea({ texto, className = "", corrido = false }: { texto: string | null | undefined; className?: string; /** resumo em linha corrida, como o Astrea mostra fechado */ corrido?: boolean }) {
  const segs = segmentosAstrea(texto).map((s) => (corrido ? { ...s, texto: s.texto.replace(/\s*\n\s*/g, " ") } : s));
  return (
    <span className={`${corrido ? "" : "whitespace-pre-line"} ${className}`}>
      {segs.map((s, i) =>
        s.destaque ? (
          <mark key={i} className="rounded-sm bg-gold/30 px-0.5 font-semibold text-foreground">
            {s.texto}
          </mark>
        ) : (
          <span key={i}>{s.texto}</span>
        )
      )}
    </span>
  );
}

type Etiqueta = { label: string; color?: string | null };

/** Etiquetas do registro, com a cor que têm no Astrea. */
export function EtiquetasAstrea({ etiquetas }: { etiquetas: unknown }) {
  const lista = (Array.isArray(etiquetas) ? etiquetas : []) as Etiqueta[];
  if (!lista.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {lista.map((e) => (
        <span
          key={e.label}
          className="rounded-full border px-2 py-px text-[11px] font-medium text-foreground/80"
          style={e.color ? { borderColor: e.color, backgroundColor: `${e.color}22` } : undefined}
        >
          {e.label}
        </span>
      ))}
    </span>
  );
}
