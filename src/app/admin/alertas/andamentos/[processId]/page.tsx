import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { EtiquetasAstrea, TextoAstrea } from "@/components/ui/texto-astrea";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { andamentosParaTratar, atividadesPendentesDoProcesso, comentariosDe, processoDoAlerta } from "@/lib/data/alertas";
import { alternarImportanteAction } from "../../actions";
import { ConcluirAndamentos, EtiquetasBotao, MenuTratar } from "../../ferramentas";
import { QuadroProcesso } from "../../quadro-processo";

// "Andamentos automáticos" do Astrea: os andamentos do alerta, cada um com
// "Tratar andamento ▾", estrela e etiqueta; ao lado o quadro do processo.

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });

export default async function TratarAndamentosPage({ params }: { params: Promise<{ processId: string }> }) {
  await exigirPermissao("processos");
  const { processId } = await params;
  const processo = await processoDoAlerta(processId);
  if (!processo) notFound();
  const [andamentos, etiquetas, pendentes] = await Promise.all([andamentosParaTratar(processId), listEtiquetas(), atividadesPendentesDoProcesso(processo)]);
  const comentarios = await comentariosDe({ andamentos: andamentos.map((a) => a.id) });
  const importantes = andamentos.filter((a) => a.importante).length;
  const cliente = processo.clients?.name ?? processo.cliente_nome;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Andamentos automáticos</h1>
          <p className="text-sm text-muted">
            {andamentos.length} novos andamentos | {importantes} importantes
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/admin/alertas?aba=andamentos" className="text-[13px] font-semibold tracking-wide text-navy-3 uppercase hover:underline">
            Voltar
          </Link>
          {andamentos.length > 0 && <ConcluirAndamentos processId={processId} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {andamentos.length === 0 && <div className="ui-card px-5 py-10 text-center text-sm text-muted">Nenhum andamento esperando tratamento neste processo.</div>}
          {andamentos.map((a) => {
            const meus = comentarios.filter((c) => c.andamento_id === a.id);
            const q = new URLSearchParams({
              titulo: `Andamento: ${a.descricao.replace(/\s+/g, " ").slice(0, 90)} — processo ${processo.numero_processo}`,
              descricao: [processo.titulo ?? "", processo.vara_tribunal ?? "", "", `${dataBR(a.data)} — ${a.descricao}`].join("\n").slice(0, 1800),
              tipo: "processo",
              andamento: a.id,
            });
            if (processo.client_id) q.set("clientId", processo.client_id);
            const qe = new URLSearchParams({ titulo: `Processo ${processo.numero_processo}`, descricao: `${dataBR(a.data)} — ${a.descricao}`.slice(0, 1800), andamento: a.id, voltar: `/admin/alertas/andamentos/${processId}` });
            if (processo.client_id) qe.set("clientId", processo.client_id);
            const textoZap = [`*Processo ${processo.numero_processo}*`, processo.titulo ?? "", "", `${dataBR(a.data)} — ${a.descricao}`].join("\n");
            return (
              <article key={a.id} id={`and-${a.id}`} className={`ui-card px-5 py-4 ${a.importante ? "ring-1 ring-gold/60" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className={`text-sm ${a.acao ? "font-medium text-status-success" : "text-muted"}`}>{a.acao ? `Tratado · ${a.acao}` : "Não tratado"}</span>
                  <MenuTratar
                    rotulo="Tratar andamento"
                    hrefTarefa={`/admin/activities/new?${q}`}
                    hrefEvento={`/admin/agenda/compromisso/novo?${qe}`}
                    processId={processId}
                    andamentoId={a.id}
                    clientId={processo.client_id}
                    textoZap={textoZap}
                    completo
                  />
                </div>
                <p className="mt-3 text-sm text-foreground">
                  <span className="font-semibold">{dataBR(a.data)}</span> - <TextoAstrea texto={a.descricao_html ?? a.descricao} corrido />
                </p>
                {meus.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-l-2 border-border pl-3">
                    {meus.map((c) => (
                      <li key={c.id} className="text-sm">
                        <span className="text-xs text-muted">
                          {c.autor_nome ?? "Equipe"} · {new Date(c.created_at).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" })}
                        </span>
                        <p className="whitespace-pre-line text-foreground/90">{c.texto}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <EtiquetasBotao andamentoId={a.id} todas={etiquetas.map((e) => ({ nome: e.nome, cor: e.cor }))} atuais={((a.etiquetas as { label: string }[] | null) ?? []).map((e) => e.label)} />
                    <EtiquetasAstrea etiquetas={a.etiquetas} />
                  </div>
                  <form action={alternarImportanteAction}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" aria-label={a.importante ? "Desmarcar importante" : "Marcar como importante"} data-tip={a.importante ? "Importante" : "Marcar como importante"}>
                      <Star className={`h-5 w-5 ${a.importante ? "fill-gold text-gold" : "text-foreground/45 hover:text-foreground"}`} aria-hidden />
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>

        <div>
          <QuadroProcesso processo={processo} cliente={cliente} pendentes={pendentes} />
        </div>
      </div>
    </div>
  );
}
