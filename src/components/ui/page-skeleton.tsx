// Esqueleto exibido enquanto a próxima tela carrega no servidor.
export function PageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div aria-busy="true" aria-label="Carregando">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-2 h-7 w-64" />
      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="ui-card p-4">
            <div className="skeleton h-3.5 w-24" />
            <div className="skeleton mt-3 h-7 w-14" />
          </div>
        ))}
      </div>
      <div className="ui-card mt-6 p-5">
        <div className="skeleton h-4 w-40" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5" style={{ width: `${70 - i * 6}%` }} />
                <div className="skeleton h-3 w-1/3" />
              </div>
              <div className="skeleton h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
