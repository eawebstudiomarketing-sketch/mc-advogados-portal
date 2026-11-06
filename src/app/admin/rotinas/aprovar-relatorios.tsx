import type { listPessoas } from "@/lib/data/escritorio";
import { Avatar } from "@/components/ui/avatar";
import { AprovarRelatorio } from "@/components/rotina/aprovar-relatorio";
import { RelatorioLeitura } from "@/components/rotina/relatorio-leitura";
import { hojeBahia, relatoriosEnviadosDesde } from "@/lib/rotina-relatorio/dados";
import { lerRegras } from "@/lib/rotina-relatorio/regras";
import { paraMin } from "@/lib/rotina-relatorio/regras-base";
import { enviadoComAtraso, type RelatorioDoDia } from "@/lib/rotina-relatorio/tipos";

// Aprovar relatórios (06/11/2026, pedido do usuário): o admin máximo aprova o
// relatório de qualquer pessoa, de qualquer dia, a qualquer hora, sem passar
// pela própria rotina. Em cima, os que faltam aprovar (últimos 60 dias); embaixo,
// o histórico dos aprovados (últimos 14 dias). Aprovar pela rotina continua igual.

type Pessoa = Awaited<ReturnType<typeof listPessoas>>[number];

const diaBr = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`);
  return `${new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(d).replace(".", "")} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
};
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });
const menosDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

export async function AprovarRelatorios({ eu, pessoas }: { eu: string | null; pessoas: Pessoa[] }) {
  const hoje = hojeBahia();
  const [rels, regras] = await Promise.all([relatoriosEnviadosDesde(menosDias(hoje, 60)), lerRegras()]);
  const daEquipe = rels.filter((r) => r.responsavel_id !== eu);
  const pendentes = daEquipe.filter((r) => !r.aprovado_em);
  const aprovados = daEquipe.filter((r) => r.aprovado_em && r.dia >= menosDias(hoje, 14));
  const pessoa = (id: string) => pessoas.find((p) => p.id === id);
  const limite = (id: string) => paraMin(regras.excecoes[id] ?? regras.prazo);

  const item = (r: RelatorioDoDia, aberto: boolean) => {
    const p = pessoa(r.responsavel_id);
    const atraso = enviadoComAtraso(r.enviado_em, limite(r.responsavel_id));
    return (
      <li key={`${r.responsavel_id}-${r.dia}`}>
        <details className="ui-card p-3.5" open={aberto}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
            <Avatar nome={p?.nome ?? "?"} foto={p?.foto ?? null} tamanho={32} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p?.nome ?? "(pessoa removida)"}</span>
            <span className="text-xs text-muted tabular-nums">
              {diaBr(r.dia)}
              {r.dia === hoje ? " (hoje)" : ""} · enviado às {hora(r.enviado_em!)}
            </span>
            {r.aprovado_em ? (
              <span className="rounded bg-status-success-bg px-1.5 py-0.5 text-xs font-semibold text-status-success">Aprovado · nota {r.nota}</span>
            ) : (
              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${atraso ? "bg-status-pending-bg text-status-pending" : "bg-status-info-bg text-status-info"}`}>Para aprovar{atraso ? " · com atraso" : ""}</span>
            )}
          </summary>
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            <RelatorioLeitura relatorio={r} />
            <AprovarRelatorio responsavelId={r.responsavel_id} dia={r.dia} nota={r.nota} comentario={r.comentario} aprovadoEm={r.aprovado_em} aprovador="Você" />
          </div>
        </details>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <section aria-label="Para aprovar" className="space-y-3">
        <h3 className="section-title">Para aprovar ({pendentes.length})</h3>
        {pendentes.length === 0 ? (
          <p className="text-sm text-muted">Nenhum relatório esperando aprovação. Tudo em dia.</p>
        ) : (
          <ul className="space-y-2">{pendentes.map((r, i) => item(r, i === 0))}</ul>
        )}
      </section>
      {aprovados.length > 0 && (
        <section aria-label="Já aprovados" className="space-y-3">
          <h3 className="section-title">Já aprovados · últimos 14 dias</h3>
          <ul className="space-y-2">{aprovados.map((r) => item(r, false))}</ul>
        </section>
      )}
    </div>
  );
}
