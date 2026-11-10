import { EditarDemanda } from "./editar-demanda";
import { chaveResposta, SECAO_ROTULO, SECOES, type RelatorioDoDia, type Valor } from "@/lib/rotina-relatorio/tipos";

// Leitura do relatório já enviado (só quem pode ler o texto: o admin máximo).
// Usa a cópia das perguntas guardada no envio, então editar o modelo depois
// não muda o que foi respondido.

export const textoDoValor = (v: Valor | undefined): string => {
  if (v === undefined || v === null || v === "") return "—";
  return Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v);
};

export function RelatorioLeitura({ relatorio }: { relatorio: RelatorioDoDia }) {
  const snap = relatorio.snapshot;
  if (!snap) return <p className="text-sm text-muted">Relatório ainda não enviado.</p>;
  return (
    <div className="space-y-4">
      {snap.demandas.length > 0 && (
        <div>
          <h4 className="eyebrow mb-1.5">Demandas vencidas e justificativas</h4>
          <ul className="space-y-1.5">
            {snap.demandas.map((d) => (
              <li key={d.id} className="text-sm">
                <span className="font-medium text-foreground">{d.titulo}</span>
                <span className="text-xs text-muted"> · {d.cliente ?? "Sem cliente"} · {d.diasAtraso > 0 ? `${d.diasAtraso} d de atraso` : "vence hoje"}</span>
                <p className="whitespace-pre-wrap text-foreground/80">{relatorio.justificativas[d.id] ?? "—"}</p>
                <div className="mt-1">
                  <EditarDemanda id={d.id} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {SECOES.map((s) => {
        const perguntas = snap.perguntas.filter((p) => p.secao === s);
        if (!perguntas.length) return null;
        if (s === "equipe_pessoa" && snap.equipe.length === 0) return null;
        return (
          <div key={s}>
            <h4 className="eyebrow mb-1.5">{SECAO_ROTULO[s].titulo}</h4>
            {s === "equipe_pessoa" ? (
              <div className="space-y-2.5">
                {snap.equipe.map((pessoa) => (
                  <div key={pessoa.id} className="rounded-lg border border-border p-2.5">
                    <p className="text-sm font-semibold text-foreground">{pessoa.nome}</p>
                    <dl className="mt-1 space-y-1">
                      {perguntas.map((p) => (
                        <div key={p.id}>
                          <dt className="text-xs text-muted">{p.texto}</dt>
                          <dd className="text-sm whitespace-pre-wrap text-foreground/90">{textoDoValor(relatorio.respostas[chaveResposta(p.id, pessoa.id)])}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            ) : (
              <dl className="space-y-1.5">
                {perguntas.map((p) => (
                  <div key={p.id}>
                    <dt className="text-xs text-muted">{p.texto}</dt>
                    <dd className="text-sm whitespace-pre-wrap text-foreground/90">{textoDoValor(relatorio.respostas[chaveResposta(p.id)])}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}
