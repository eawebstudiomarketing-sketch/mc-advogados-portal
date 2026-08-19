import { mockProcessos } from "@/lib/mock-data";

export default function AdminProcessesPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Processos</h1>
          <p className="text-sm text-foreground/50">{mockProcessos.length} processos ativos</p>
        </div>
        <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90">
          Novo processo
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Número</th>
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Vara / Tribunal</th>
              <th className="px-5 py-3 font-medium">Área</th>
              <th className="px-5 py-3 font-medium">Fase</th>
              <th className="px-5 py-3 font-medium">Responsável</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockProcessos.map((p) => (
              <tr key={p.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{p.numero}</td>
                <td className="px-5 py-3 text-foreground/70">{p.clientName}</td>
                <td className="px-5 py-3 text-foreground/70">{p.varaTribunal}</td>
                <td className="px-5 py-3 text-foreground/70">{p.area}</td>
                <td className="px-5 py-3 text-foreground/70">{p.fase}</td>
                <td className="px-5 py-3 text-foreground/70">{p.responsible}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
