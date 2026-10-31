"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Eye, Loader2, SkipForward, TriangleAlert, Undo2 } from "lucide-react";
import { configColidenciaLoteAction, statusColidenciaAction } from "../actions";

// Abas da tela Colidências: Análise (por marca), Ações Necessárias,
// Monitoramento e Configuração de Colidência (em lote).

type Colid = {
  id: string;
  rpi: number;
  marcaProcesso: string;
  marcaNome: string;
  marcaClasse: string | null;
  processo: string;
  nome: string | null;
  classe: string | null;
  titular: string | null;
  despacho: string | null;
  semelhanca: number | null;
  risco: "alto" | "medio" | "baixo";
  status: "pendente" | "revisada" | "acao" | "monitorando";
};
type MarcaCfg = { processo: string; nome: string; classe: string | null; escopo: number; sensibilidade: number; auto: boolean; ativa: boolean };

const RISCO = { alto: "bg-status-danger-bg text-status-danger", medio: "bg-status-pending-bg text-status-pending", baixo: "bg-surface-2 text-muted" };
const rotRisco = (r: Colid["risco"]) => (r === "medio" ? "Médio" : r === "alto" ? "Alto" : "Baixo");

export function PainelColidencias({ rpi, revistas, colidencias, marcas }: { rpi: number; revistas: number[]; colidencias: Colid[]; marcas: MarcaCfg[] }) {
  const router = useRouter();
  const [aba, setAba] = useState<"analise" | "acoes" | "monitor" | "config">("analise");
  const [filtroStatus, setFiltroStatus] = useState<"todas" | "pendentes" | "revisadas">("pendentes");
  const [filtroRisco, setFiltroRisco] = useState<"todos" | "alto" | "medio">("todos");
  const [marcaSel, setMarcaSel] = useState<string | null>(null);
  const [selCfg, setSelCfg] = useState<Set<string>>(new Set());
  const [escopo, setEscopo] = useState(1);
  const [sens, setSens] = useState(2);
  const [pending, start] = useTransition();

  const daRevista = colidencias.filter((c) => c.rpi === rpi);
  const porMarca = useMemo(() => {
    const m = new Map<string, Colid[]>();
    for (const c of daRevista) {
      if (filtroRisco !== "todos" && c.risco !== filtroRisco) continue;
      if (filtroStatus === "pendentes" && c.status !== "pendente") continue;
      if (filtroStatus === "revisadas" && c.status === "pendente") continue;
      m.set(c.marcaProcesso, [...(m.get(c.marcaProcesso) ?? []), c]);
    }
    return [...m.entries()].sort((a, b) => Math.max(...b[1].map((x) => x.semelhanca ?? 0)) - Math.max(...a[1].map((x) => x.semelhanca ?? 0)));
  }, [daRevista, filtroRisco, filtroStatus]);
  const atual = porMarca.find(([p]) => p === marcaSel) ?? porMarca[0];
  const acoes = colidencias.filter((c) => c.status === "acao");
  const monitor = colidencias.filter((c) => c.status === "monitorando");

  function mudar(ids: string[], status: Colid["status"], msg: string) {
    start(async () => {
      const r = await statusColidenciaAction(ids, status);
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      router.refresh();
    });
  }
  function pular() {
    const i = porMarca.findIndex(([p]) => p === atual?.[0]);
    setMarcaSel(porMarca[(i + 1) % Math.max(1, porMarca.length)]?.[0] ?? null);
  }

  const contador = (n: number, rotulo: string, cor = "") => (
    <div className="ui-card p-4">
      <p className={`numero-grande text-2xl ${cor}`}>{n}</p>
      <p className="eyebrow mt-1">{rotulo}</p>
    </div>
  );
  const linhaColid = (c: Colid, botoes: React.ReactNode) => (
    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RISCO[c.risco]}`}>Risco {rotRisco(c.risco)}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{c.nome ?? "—"}</p>
        <p className="text-xs text-muted">
          <span className="font-mono">{c.processo}</span> · {c.classe ?? "—"} · {c.titular ?? "—"} · RPI {c.rpi}
        </p>
        <p className="text-xs text-foreground/70">
          Parecida com <Link href={`/admin/marcas/processos/${c.marcaProcesso}`} className="ui-link">{c.marcaNome}</Link>
          {c.semelhanca != null ? ` · ${Math.round(c.semelhanca * 100)}% de semelhança` : ""}
        </p>
      </div>
      <div className="flex gap-1">{botoes}</div>
    </li>
  );

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-5 border-b border-border" aria-label="Colidências">
        {([
          ["analise", "Análise de Colidências", daRevista.filter((c) => c.status === "pendente").length],
          ["acoes", "Ações Necessárias", acoes.length],
          ["monitor", "Monitoramento", monitor.length],
          ["config", "Configuração de Colidência", null],
        ] as const).map(([id, rotulo, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            aria-current={aba === id ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-2.5 text-[15px] transition-colors ${aba === id ? "border-navy-3 font-medium text-foreground" : "border-transparent text-foreground/65 hover:text-foreground"}`}
          >
            {rotulo}
            {n !== null && <span className={`rounded px-1.5 text-[11px] font-semibold ${n ? "bg-navy-3 text-white" : "bg-surface-2 text-muted"}`}>{n}</span>}
          </button>
        ))}
      </nav>

      {aba === "analise" && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="font-medium">Relatório de Colidências · Selecionar RPI:</span>
              <select value={rpi} onChange={(e) => router.push(`/admin/marcas/colidencias?rpi=${e.target.value}`)} className="ui-input h-9 w-auto py-1">
                {revistas.length === 0 && <option value={0}>Nenhuma revista lida</option>}
                {revistas.map((n) => (
                  <option key={n} value={n}>
                    RPI {n}
                  </option>
                ))}
              </select>
            </label>
            {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" aria-hidden />}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {contador(new Set(daRevista.map((c) => c.marcaProcesso)).size, "Marcas")}
            {contador(daRevista.length, "Colidências")}
            {contador(daRevista.filter((c) => c.risco === "alto").length, "Risco Alto", "text-status-danger")}
            {contador(daRevista.filter((c) => c.risco === "medio").length, "Risco Médio", "text-status-pending")}
          </div>
          {daRevista.length === 0 ? (
            <div className="ui-card p-6 text-center text-sm text-muted">
              Nenhum relatório de colidências para esta revista. O relatório é gerado sozinho quando o portal lê a próxima RPI, para as marcas com colidência ligada em Configurar.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <section className="ui-card overflow-hidden">
                <div className="space-y-2 border-b border-border p-3">
                  <p className="text-sm font-semibold">Suas Marcas ({porMarca.length})</p>
                  <div className="flex gap-2">
                    <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)} className="ui-input h-8 py-0 text-xs" aria-label="Status">
                      <option value="todas">Todas</option>
                      <option value="pendentes">Pendentes</option>
                      <option value="revisadas">Revisadas</option>
                    </select>
                    <select value={filtroRisco} onChange={(e) => setFiltroRisco(e.target.value as typeof filtroRisco)} className="ui-input h-8 py-0 text-xs" aria-label="Risco">
                      <option value="todos">Todos</option>
                      <option value="alto">Alto</option>
                      <option value="medio">Médio</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => mudar(daRevista.filter((c) => c.risco !== "alto" && c.status === "pendente").map((c) => c.id), "revisada", "Marcas de baixo risco marcadas como revisadas")}
                    className="ui-link text-xs"
                  >
                    Marcar como revisadas todas as marcas com baixo risco
                  </button>
                </div>
                <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                  {porMarca.length === 0 && <li className="p-4 text-sm text-muted">Nenhuma colidência a revisar.</li>}
                  {porMarca.map(([proc, cs]) => (
                    <li key={proc}>
                      <button type="button" onClick={() => setMarcaSel(proc)} className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-hover ${atual?.[0] === proc ? "bg-gold-soft" : ""}`}>
                        <span className="min-w-0 flex-1 truncate font-medium">{cs[0].marcaNome}</span>
                        <span className="rounded bg-surface-2 px-1.5 text-[11px] font-semibold tabular-nums">{cs.length}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="ui-card overflow-hidden">
                {atual ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
                      <p className="mr-auto text-sm font-semibold">
                        {atual[1][0].marcaNome} <span className="font-mono text-xs font-normal text-muted">{atual[0]}</span>
                      </p>
                      <button type="button" onClick={pular} className="ui-btn-secondary h-8 px-2.5 text-xs">
                        <SkipForward className="h-3.5 w-3.5" aria-hidden /> Pular Marca
                      </button>
                      <button type="button" disabled={pending} onClick={() => mudar(atual[1].map((c) => c.id), "revisada", "Marca revisada")} className="ui-btn h-8 px-2.5 text-xs">
                        <Check className="h-3.5 w-3.5" aria-hidden /> Marcar como Revisada
                      </button>
                      <button type="button" disabled={pending} onClick={() => mudar(atual[1].map((c) => c.id), "pendente", "Revisão desfeita")} className="ui-btn-secondary h-8 px-2.5 text-xs">
                        <Undo2 className="h-3.5 w-3.5" aria-hidden /> Desfazer Revisão
                      </button>
                    </div>
                    <ul className="divide-y divide-border">
                      {atual[1].map((c) =>
                        linhaColid(
                          c,
                          <>
                            <button type="button" disabled={pending} onClick={() => mudar([c.id], "acao", "Enviada para Ações Necessárias")} className="ui-btn-secondary h-8 px-2.5 text-xs">
                              <TriangleAlert className="h-3.5 w-3.5" aria-hidden /> Enviar para Ações Necessárias
                            </button>
                            <button type="button" disabled={pending} onClick={() => mudar([c.id], "monitorando", "Processo em monitoramento")} className="ui-btn-secondary h-8 px-2.5 text-xs" aria-label="Monitorar">
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </>
                        )
                      )}
                    </ul>
                  </>
                ) : (
                  <p className="p-6 text-sm text-muted">Clique em uma marca na lista à esquerda para ver as colidências.</p>
                )}
              </section>
            </div>
          )}
        </>
      )}

      {aba === "acoes" && (
        <section className="ui-card overflow-hidden">
          <p className="border-b border-border px-4 py-3 text-sm text-muted">Colidências que pedem providência (por exemplo, oposição em até 60 dias da publicação). Os itens aparecem aqui ao clicar em “Enviar para Ações Necessárias”.</p>
          <ul className="divide-y divide-border">
            {acoes.length === 0 && <li className="p-6 text-center text-sm text-muted">Nenhuma ação necessária.</li>}
            {acoes.map((c) =>
              linhaColid(
                c,
                <button type="button" disabled={pending} onClick={() => mudar([c.id], "revisada", "Arquivada")} className="ui-btn-secondary h-8 px-2.5 text-xs">
                  Arquivar
                </button>
              )
            )}
          </ul>
        </section>
      )}

      {aba === "monitor" && (
        <section className="ui-card overflow-hidden">
          <p className="border-b border-border px-4 py-3 text-sm text-muted">Monitoramento de processos colidentes: acompanhe o andamento das marcas de terceiros parecidas com as suas.</p>
          <ul className="divide-y divide-border">
            {monitor.length === 0 && <li className="p-6 text-center text-sm text-muted">Nenhum processo em monitoramento.</li>}
            {monitor.map((c) =>
              linhaColid(
                c,
                <button type="button" disabled={pending} onClick={() => mudar([c.id], "revisada", "Saiu do monitoramento")} className="ui-btn-secondary h-8 px-2.5 text-xs">
                  Parar de monitorar
                </button>
              )
            )}
          </ul>
        </section>
      )}

      {aba === "config" && (
        <section className="ui-card overflow-hidden">
          <div className="space-y-3 border-b border-border p-4">
            <p className="text-sm text-muted">Atualize a sensibilidade de colidência de várias marcas em um único fluxo.</p>
            <div className="flex flex-wrap items-center gap-3">
              <select value={escopo} onChange={(e) => setEscopo(Number(e.target.value))} className="ui-input h-9 w-auto py-1" aria-label="Escopo">
                <option value={1}>Marcas da mesma classe</option>
                <option value={2}>Marcas da mesma natureza</option>
                <option value={3}>Todas as marcas</option>
              </select>
              <select value={sens} onChange={(e) => setSens(Number(e.target.value))} className="ui-input h-9 w-auto py-1" aria-label="Sensibilidade">
                <option value={1}>Alta (&gt;70%)</option>
                <option value={2}>Média (&gt;85%)</option>
                <option value={3}>Baixa (&gt;95%)</option>
              </select>
              <button
                type="button"
                disabled={pending || !selCfg.size}
                onClick={() =>
                  start(async () => {
                    const r = await configColidenciaLoteAction([...selCfg], escopo, sens);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(`Configuração aplicada em ${selCfg.size} marca(s)`);
                    setSelCfg(new Set());
                    router.refresh();
                  })
                }
                className="ui-btn h-9"
              >
                Aplicar a {selCfg.size} selecionada(s)
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="ui-table">
              <thead>
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" aria-label="Selecionar todas" checked={selCfg.size === marcas.length && marcas.length > 0} onChange={(e) => setSelCfg(e.target.checked ? new Set(marcas.map((m) => m.processo)) : new Set())} className="h-4 w-4 accent-[var(--navy)]" />
                  </th>
                  <th className="px-4 py-2.5">Marca</th>
                  <th className="px-4 py-2.5">Classe</th>
                  <th className="px-4 py-2.5">Escopo</th>
                  <th className="px-4 py-2.5">Sensibilidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {marcas.map((m) => (
                  <tr key={m.processo}>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selCfg.has(m.processo)}
                        onChange={(e) =>
                          setSelCfg((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(m.processo);
                            else n.delete(m.processo);
                            return n;
                          })
                        }
                        aria-label={`Selecionar ${m.nome}`}
                        className="h-4 w-4 accent-[var(--navy)]"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm">
                      <Link href={`/admin/marcas/configurar?processo=${m.processo}`} className="font-medium hover:underline">
                        {m.nome}
                      </Link>
                      {!m.ativa && <span className="ml-2 text-xs text-muted">(colidência desligada)</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">{m.classe ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">{m.auto ? "Automático" : ["", "Mesma classe", "Mesma natureza", "Todas"][m.escopo]}</td>
                    <td className="px-4 py-2 text-xs">{m.auto ? "Automático" : ["", "Alta", "Média", "Baixa"][m.sensibilidade]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
