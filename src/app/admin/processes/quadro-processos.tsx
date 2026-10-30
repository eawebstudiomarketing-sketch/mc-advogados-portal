import Link from "next/link";
import type { Process } from "@/lib/data/processes";
import { PROCESS_AREA_LABEL, PROCESS_AREAS } from "@/lib/process-area";

// Visões em colunas da lista de processos (item 17 da auditoria, 30/10/2026).
// "area": uma coluna por área (a fase quase nunca vem preenchida do Astrea).
// "movimento": pela última movimentação, para achar processo parado.

type Coluna = { id: string; titulo: string; cor: string; itens: Process[] };

const DIA = 86_400_000;
function faixaDoMovimento(iso: string | null, agora: number): string {
  if (!iso) return "sem";
  const dias = (agora - Date.parse(iso)) / DIA;
  if (dias <= 7) return "semana";
  if (dias <= 30) return "mes";
  if (dias <= 90) return "tres";
  return "parado";
}

function colunas(processos: Process[], como: "area" | "movimento", agora: number): Coluna[] {
  if (como === "area") {
    return PROCESS_AREAS.map((a) => ({ id: a, titulo: PROCESS_AREA_LABEL[a], cor: "bg-navy-3", itens: processos.filter((p) => p.area === a) }));
  }
  const faixas: Omit<Coluna, "itens">[] = [
    { id: "parado", titulo: "Parado há mais de 3 meses", cor: "bg-status-danger" },
    { id: "tres", titulo: "Movimentou há 1 a 3 meses", cor: "bg-status-pending" },
    { id: "mes", titulo: "Movimentou no último mês", cor: "bg-status-info" },
    { id: "semana", titulo: "Movimentou esta semana", cor: "bg-status-success" },
    { id: "sem", titulo: "Sem movimentação lida", cor: "bg-border-strong" },
  ];
  return faixas.map((f) => ({ ...f, itens: processos.filter((p) => faixaDoMovimento(p.ultimo_andamento_em, agora) === f.id) }));
}

export function QuadroProcessos({ processos, como, agora }: { processos: Process[]; como: "area" | "movimento"; agora: number }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-3">
        {colunas(processos, como, agora).map((c) => (
          <section key={c.id} aria-label={c.titulo} className="flex w-72 shrink-0 flex-col rounded-2xl border border-border bg-surface-2/60">
            <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
              <span className={`h-2 w-2 rounded-full ${c.cor}`} aria-hidden />
              <h2 className="flex-1 truncate text-sm font-semibold text-foreground">{c.titulo}</h2>
              <span className="rounded-full bg-surface px-2 text-xs font-semibold text-muted tabular-nums ring-1 ring-border">{c.itens.length}</span>
            </header>
            <ul className="max-h-[65vh] space-y-2 overflow-y-auto px-2.5 pb-3">
              {c.itens.length === 0 && <li className="px-1 py-4 text-center text-xs text-muted">Nenhum processo aqui.</li>}
              {c.itens.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/processes/${p.id}`}
                    className="block rounded-xl border border-border bg-surface p-3 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm"
                  >
                    <p className="truncate text-[13px] font-semibold text-foreground">{p.titulo ?? p.numero_processo}</p>
                    {p.titulo && <p className="truncate font-mono text-[11px] text-muted">{p.numero_processo}</p>}
                    <p className="mt-1.5 truncate text-xs text-foreground/70">{p.clients?.name ?? p.cliente_nome ?? "Sem cliente"}</p>
                    <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted">
                      <span className="truncate">{como === "area" ? (p.vara_tribunal ?? "—") : PROCESS_AREA_LABEL[p.area]}</span>
                      <span className="shrink-0 tabular-nums">
                        {p.ultimo_andamento_em ? new Date(p.ultimo_andamento_em).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }) : "—"}
                      </span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
