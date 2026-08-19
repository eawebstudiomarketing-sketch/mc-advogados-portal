import { mockReports, mockClients } from "@/lib/mock-data";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function AdminReportsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Relatórios mensais</h1>
          <p className="text-sm text-foreground/50">Relatórios em PDF gerados e enviados aos clientes</p>
        </div>
        <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90">
          Gerar relatório
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Referência</th>
              <th className="px-5 py-3 font-medium">Enviado em</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockReports.map((r) => (
              <tr key={r.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">
                  {mockClients.find((c) => c.id === r.clientId)?.name}
                </td>
                <td className="px-5 py-3 text-foreground/70">{MESES[r.referenceMonth]} de {r.referenceYear}</td>
                <td className="px-5 py-3 text-foreground/70">{new Date(r.sentAt + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                <td className="px-5 py-3">
                  <button className="text-xs font-medium text-navy hover:underline">Baixar PDF</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
