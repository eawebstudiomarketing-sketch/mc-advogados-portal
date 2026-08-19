import { mockDocumentos, mockClients, formatDate } from "@/lib/mock-data";

export default function AdminDocumentsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-navy">Documentos</h1>
          <p className="text-sm text-foreground/50">{mockDocumentos.length} documentos armazenados</p>
        </div>
        <button className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-navy-foreground hover:bg-navy/90">
          Enviar documento
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Documento</th>
              <th className="px-5 py-3 font-medium">Cliente</th>
              <th className="px-5 py-3 font-medium">Categoria</th>
              <th className="px-5 py-3 font-medium">Enviado por</th>
              <th className="px-5 py-3 font-medium">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockDocumentos.map((d) => (
              <tr key={d.id} className="hover:bg-background">
                <td className="px-5 py-3 font-medium text-foreground">{d.title}</td>
                <td className="px-5 py-3 text-foreground/70">
                  {mockClients.find((c) => c.id === d.clientId)?.name}
                </td>
                <td className="px-5 py-3 text-foreground/70">{d.category}</td>
                <td className="px-5 py-3 text-foreground/70">{d.uploadedBy}</td>
                <td className="px-5 py-3 text-foreground/70">{formatDate(d.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
