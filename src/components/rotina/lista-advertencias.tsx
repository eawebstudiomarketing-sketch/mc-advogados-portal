import type { Advertencia } from "@/lib/rotina-relatorio/advertencias";

// Lista de advertências por relatório do dia não enviado (19/11/2026).
// `equipe`: Painel do Dono (resumo por pessoa + coluna com o nome); sem ele, Indicadores da própria pessoa.

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
const diaBr = (d: string) => `${SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Situacao({ a }: { a: Advertencia }) {
  return a.enviadoEm ? (
    <span className="rounded-full bg-status-pending-bg px-2 py-0.5 text-xs font-medium text-status-pending">Enviado com atraso · {quando(a.enviadoEm)}</span>
  ) : (
    <span className="rounded-full bg-status-danger-bg px-2 py-0.5 text-xs font-medium text-status-danger">Ainda não enviado</span>
  );
}

export function ListaAdvertencias({ itens, equipe, mesAtual }: { itens: Advertencia[]; equipe?: boolean; mesAtual: string }) {
  if (!itens.length)
    return <div className="ui-card p-6 text-sm text-muted">{equipe ? "Nenhuma advertência até agora. Todo mundo enviou o relatório no dia. 👏" : "Nenhuma advertência. Você enviou todos os relatórios no dia. 👏"}</div>;

  const meses = [...new Set(itens.map((a) => a.dia.slice(0, 7)))].sort().reverse();
  const porPessoa = new Map<string, { nome: string; total: number; mes: number; faltando: number }>();
  for (const a of itens) {
    const p = porPessoa.get(a.responsavelId) ?? { nome: a.nome, total: 0, mes: 0, faltando: 0 };
    p.total++;
    if (a.dia.startsWith(mesAtual)) p.mes++;
    if (!a.enviadoEm) p.faltando++;
    porPessoa.set(a.responsavelId, p);
  }
  const doMes = itens.filter((a) => a.dia.startsWith(mesAtual)).length;

  return (
    <div className="space-y-5">
      {equipe ? (
        <div className="ui-card min-w-0 overflow-x-auto p-5">
          <p className="mb-3 text-sm font-semibold text-foreground">Por pessoa</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 pr-3 font-medium">Pessoa</th>
                <th className="py-1.5 pr-3 text-right font-medium">Neste mês</th>
                <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                <th className="py-1.5 text-right font-medium">Ainda faltando</th>
              </tr>
            </thead>
            <tbody>
              {[...porPessoa.values()]
                .sort((a, b) => b.mes - a.mes || b.total - a.total || a.nome.localeCompare(b.nome))
                .map((p) => (
                  <tr key={p.nome} className="border-t border-border">
                    <td className="py-2 pr-3 text-foreground">{p.nome}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${p.mes ? "font-semibold text-status-danger" : "text-muted"}`}>{p.mes}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">{p.total}</td>
                    <td className={`py-2 text-right tabular-nums ${p.faltando ? "text-status-danger" : "text-muted"}`}>{p.faltando}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          <b className="text-foreground">{doMes}</b> {doMes === 1 ? "advertência" : "advertências"} neste mês · <b className="text-foreground">{itens.length}</b> no total.
        </p>
      )}

      {meses.map((m) => {
        const doM = itens.filter((a) => a.dia.startsWith(m));
        return (
          <section key={m} className="ui-card min-w-0 p-5">
            <p className="mb-2 text-sm font-semibold text-foreground first-letter:uppercase">
              {nomeMes(m)} <span className="font-normal text-muted">· {doM.length} {doM.length === 1 ? "advertência" : "advertências"}</span>
            </p>
            <ul>
              {doM.map((a) => (
                <li key={`${a.responsavelId}|${a.dia}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0">
                  <span className="w-24 shrink-0 text-sm tabular-nums text-foreground">{diaBr(a.dia)}</span>
                  {equipe && <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{a.nome}</span>}
                  <span className={equipe ? "" : "flex-1"}>
                    <Situacao a={a} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
