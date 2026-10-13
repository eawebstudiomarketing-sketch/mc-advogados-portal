// Gráfico de barras em CSS puro (sem lib de gráfico). O último ponto (mês
// atual) fica em dourado; o valor aparece acima de cada barra.
export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex h-44 gap-2 sm:gap-3">
      {data.map((d, i) => {
        const atual = i === data.length - 1;
        return (
          <div key={d.label} className="group flex flex-1 flex-col items-center">
            <div className="flex w-full flex-1 items-end pt-5">
              <div
                className={`relative w-full rounded-md transition-[height,background-color] duration-500 ease-[var(--ease-out)] ${
                  atual ? "bg-gold" : "bg-navy/15 group-hover:bg-navy/30"
                }`}
                style={{ height: `${Math.max((d.value / max) * 100, 3)}%` }}
              >
                <span
                  className={`absolute inset-x-0 -top-5 text-center text-[11px] font-medium tabular-nums ${
                    atual ? "text-gold-ink" : "text-muted opacity-0 transition-opacity group-hover:opacity-100"
                  }`}
                >
                  {d.value}h
                </span>
              </div>
            </div>
            <span className={`mt-2 text-xs ${atual ? "font-medium text-foreground" : "text-muted"}`}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}
