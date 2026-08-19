// Gráfico de barras simples em CSS puro — sem dependência de lib de gráfico
// ainda (nenhuma foi definida na stack). Suficiente pra visualizar o layout
// com dados fictícios; trocar por uma lib de verdade quando ligar dados reais.
export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex h-40 gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center">
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md bg-gold transition-[height]"
              style={{ height: `${Math.max((d.value / max) * 100, 4)}%` }}
              title={`${d.value}h`}
            />
          </div>
          <span className="mt-2 text-xs text-foreground/50">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
