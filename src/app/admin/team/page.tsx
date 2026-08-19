import { mockTeam } from "@/lib/mock-data";

export default function AdminTeamPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Equipe</h1>
          <p className="text-sm text-foreground/50">{mockTeam.length} pessoas com acesso ao painel</p>
        </div>
        <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90">
          Convidar pessoa
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Nome</th>
              <th className="px-5 py-3 font-medium">E-mail</th>
              <th className="px-5 py-3 font-medium">Papel</th>
              <th className="px-5 py-3 font-medium">Clientes ativos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockTeam.map((t) => (
              <tr key={t.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{t.name}</td>
                <td className="px-5 py-3 text-foreground/70">{t.email}</td>
                <td className="px-5 py-3 text-foreground/70">{t.role === "admin" ? "Administrador" : "Advogado(a)"}</td>
                <td className="px-5 py-3 tabular-nums text-foreground/70">{t.clientesAtivos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
