import Link from "next/link";
import { respondidas, totalPerguntas, type Regimento } from "@/lib/regimentos/tipos";

// Lista de regimentos (tela Regimento Interno e aba Regimento da ficha do cliente).

const STATUS = {
  rascunho: { rotulo: "Rascunho", cls: "bg-surface-2 text-muted" },
  enviado: { rotulo: "Aguardando resposta", cls: "bg-status-pending-bg text-status-pending" },
  respondido: { rotulo: "Respondido", cls: "bg-status-success-bg text-status-success" },
} as const;
const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });

export function ListaRegimentos({ regimentos, mostrarCliente = true }: { regimentos: Regimento[]; mostrarCliente?: boolean }) {
  if (!regimentos.length) return <p className="px-5 py-8 text-center text-sm text-muted">Nenhum regimento ainda.</p>;
  return (
    <ul className="divide-y divide-border">
      {regimentos.map((r) => {
        const st = STATUS[r.status];
        const total = totalPerguntas(r.secoes);
        const resp = respondidas(r.secoes, r.respostas ?? r.rascunho_respostas);
        return (
          <li key={r.id}>
            <Link href={`/admin/regimentos/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-hover">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{r.titulo}</p>
                <p className="text-xs text-muted">
                  {mostrarCliente && r.clients?.name ? `${r.clients.name} · ` : ""}
                  {r.secoes.length} seções · {total} perguntas · criado em {dataBR(r.created_at)}
                  {r.origem === "drive" ? " · importado do Drive" : ""}
                </p>
              </div>
              <span className="text-xs text-muted tabular-nums">
                {resp}/{total} respondidas
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.rotulo}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
