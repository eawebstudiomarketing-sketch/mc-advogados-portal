import Link from "next/link";
import { PERIODOS, type Periodo } from "@/lib/periodo";

// Pílulas Hoje · Esta semana · Este mês · Personalizado. O personalizado é um
// formulário GET (de/até) que mantém os outros filtros da página.
export function PeriodoFiltro({
  atual,
  base,
  manter = {},
  ancora,
  nomes = { periodo: "periodo", de: "de", ate: "ate" },
}: {
  /** nomes dos parâmetros na URL (a Visão geral já usa "periodo" pro ranking) */
  nomes?: { periodo: string; de: string; ate: string };
  atual: Periodo;
  /** caminho da página, ex.: "/admin/agenda" */
  base: string;
  /** outros parâmetros da URL que devem continuar valendo */
  manter?: Record<string, string | undefined>;
  /** rola até esta seção depois de trocar (ex.: "agenda") */
  ancora?: string;
}) {
  const fixos = Object.entries(manter).filter((e): e is [string, string] => !!e[1]);
  const href = (periodo: string) => {
    const q = new URLSearchParams(fixos);
    q.set(nomes.periodo, periodo);
    return `${base}?${q}${ancora ? `#${ancora}` : ""}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-full border border-border bg-surface p-0.5 text-xs" role="tablist" aria-label="Período">
        {PERIODOS.map((p) => {
          const on = atual.chave === p.chave;
          return (
            <Link
              key={p.chave}
              href={href(p.chave)}
              role="tab"
              aria-selected={on}
              scroll={!ancora}
              className={`rounded-full px-3 py-1.5 font-medium whitespace-nowrap transition-colors ${on ? "bg-navy text-white" : "text-foreground/60 hover:text-foreground"}`}
            >
              {p.rotulo}
            </Link>
          );
        })}
      </div>
      {atual.chave === "personalizado" && (
        <form method="get" action={`${base}${ancora ? `#${ancora}` : ""}`} className="flex flex-wrap items-center gap-1.5">
          {fixos.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <input type="hidden" name={nomes.periodo} value="personalizado" />
          <input type="date" name={nomes.de} defaultValue={atual.de} aria-label="De" className="ui-input !w-auto !py-1.5 text-xs" required />
          <span className="text-xs text-muted">até</span>
          <input type="date" name={nomes.ate} defaultValue={atual.ate} aria-label="Até" className="ui-input !w-auto !py-1.5 text-xs" required />
          <button type="submit" className="ui-btn px-3 py-1.5 text-xs">
            Ver
          </button>
        </form>
      )}
    </div>
  );
}
