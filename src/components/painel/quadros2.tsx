"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PERIODOS, aberta, atrasada, dataBahia, dentro, hojeBahia, pesoAtividade, periodoDe, somaDias } from "@/lib/painel/base";
import type { LinhaDist } from "@/lib/painel/extras";
import { BarraSituacao, Barras, COR_1, COR_2 } from "./graficos";
import { FiltroQuadro, Quadro, usePainel, useFiltro } from "./contexto";
import { Avatar, LinhaAgenda, PorResponsavel } from "./pessoas";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ORIGEM: Record<string, string> = { whatsapp: "WhatsApp", portal_cliente: "Portal do cliente", publicacao: "Publicações", email: "E-mail", outro: "Outro" };
const sel = "ui-input !w-auto max-w-[11rem] !py-1 !pl-2 !pr-7 text-xs";

/* ───────── Clientes ───────── */

/** Mapa de calor: clientes × últimos 6 meses (demandas = atividades + itens da Distribuição sem atividade). */
export function MapaCalorClientes({ dist, meses }: { dist: LinhaDist[]; meses: string[] }) {
  const { atividades, clientes } = usePainel();
  const [tipo, setTipo] = useState<"" | "PJ" | "PF">("");
  const [ordem, setOrdem] = useState<"total" | "crescendo" | "sumindo">("total");
  const linhas = useMemo(() => {
    const m = new Map<string, number[]>();
    const add = (cid: string | null, iso: string) => {
      if (!cid) return;
      const k = meses.indexOf(dataBahia(iso).slice(0, 7));
      if (k < 0) return;
      const c = clientes.get(cid);
      if (!c || (tipo && c.pf !== (tipo === "PF"))) return;
      const v = m.get(cid) ?? meses.map(() => 0);
      v[k]++;
      m.set(cid, v);
    };
    for (const a of atividades) add(a.clienteId, a.pedido);
    for (const d of dist) if (!d.activityId) add(d.clienteId, d.criada);
    const tend = (v: number[]) => v.slice(-2).reduce((s, x) => s + x, 0) - v.slice(-4, -2).reduce((s, x) => s + x, 0);
    return [...m.entries()]
      .map(([id, v]) => ({ id, nome: clientes.get(id)?.nome ?? "?", v, total: v.reduce((s, x) => s + x, 0), tend: tend(v) }))
      .sort((a, b) => (ordem === "total" ? b.total - a.total : ordem === "crescendo" ? b.tend - a.tend : a.tend - b.tend))
      .slice(0, 20);
  }, [atividades, clientes, dist, meses, tipo, ordem]);
  const max = Math.max(1, ...linhas.flatMap((l) => l.v));
  return (
    <Quadro
      titulo="Mapa de calor de demandas"
      apoio="Clientes × meses · quanto mais escuro, mais demandas"
      filtro={
        <div className="flex flex-wrap gap-1.5">
          <select aria-label="Tipo de cliente" className={sel} value={tipo} onChange={(e) => setTipo(e.target.value as "" | "PF" | "PJ")}>
            <option value="">PF e PJ</option>
            <option value="PJ">Só empresas</option>
            <option value="PF">Só pessoas físicas</option>
          </select>
          <select aria-label="Ordenar" className={sel} value={ordem} onChange={(e) => setOrdem(e.target.value as "total")}>
            <option value="total">Mais demandas</option>
            <option value="crescendo">Crescendo</option>
            <option value="sumindo">Sumindo</option>
          </select>
        </div>
      }
    >
      {linhas.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma demanda nesses meses.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-[3px] text-xs">
            <thead>
              <tr>
                <th className="text-left font-normal text-muted">Cliente</th>
                {meses.map((ym) => (
                  <th key={ym} className="w-12 text-center font-normal text-muted">
                    {MESES[Number(ym.slice(5, 7)) - 1]}
                  </th>
                ))}
                <th className="w-10 text-right font-normal text-muted">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <td className="max-w-[16rem] truncate pr-2">
                    <Link href={`/admin/painel?aba=clientes&cliente=${l.id}`} className="text-foreground hover:underline">
                      {l.nome}
                    </Link>
                  </td>
                  {l.v.map((x, k) => (
                    <td
                      key={k}
                      title={`${l.nome} · ${MESES[Number(meses[k].slice(5, 7)) - 1]}: ${x} demanda(s)`}
                      className={`h-7 rounded-[4px] text-center tabular-nums ${x / max > 0.55 ? "text-white" : "text-foreground"}`}
                      style={{ background: x ? `color-mix(in oklab, ${COR_1} ${Math.round(18 + (x / max) * 82)}%, transparent)` : "var(--surface-2)" }}
                    >
                      {x || ""}
                    </td>
                  ))}
                  <td className="text-right font-medium tabular-nums text-foreground">{l.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Quadro>
  );
}

/* ───────── Distribuição ───────── */

function useDist(dist: LinhaDist[]) {
  const { clientes, periodoPagina } = usePainel();
  const [f, setF] = useState({ periodo: "pagina", origem: "", cliente: "" });
  const periodo = useMemo(() => periodoDe(f.periodo === "pagina" ? periodoPagina : f.periodo), [f.periodo, periodoPagina]);
  const linhas = useMemo(
    () =>
      dist.filter((d) => {
        if (f.origem && d.origem !== f.origem) return false;
        if (f.cliente === "PF" || f.cliente === "PJ") {
          const c = d.clienteId ? clientes.get(d.clienteId) : null;
          if (!c || c.pf !== (f.cliente === "PF")) return false;
        } else if (f.cliente && d.clienteId !== f.cliente) return false;
        return true;
      }),
    [dist, f, clientes]
  );
  const filtro = (
    <div className="flex flex-wrap justify-end gap-1.5">
      <select aria-label="Período" className={sel} value={f.periodo} onChange={(e) => setF({ ...f, periodo: e.target.value })}>
        <option value="pagina">Período da página</option>
        {PERIODOS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.rotulo}
          </option>
        ))}
      </select>
      <select aria-label="Origem" className={sel} value={f.origem} onChange={(e) => setF({ ...f, origem: e.target.value })}>
        <option value="">Todas as origens</option>
        {Object.entries(ORIGEM).map(([v, r]) => (
          <option key={v} value={v}>
            {r}
          </option>
        ))}
      </select>
      <select aria-label="Cliente" className={sel} value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })}>
        <option value="">Todos os clientes</option>
        <option value="PJ">Só empresas (PJ)</option>
        <option value="PF">Só pessoas físicas (PF)</option>
        {[...new Set(dist.map((d) => d.clienteId).filter((x): x is string => !!x))]
          .map((id) => ({ id, nome: clientes.get(id)?.nome ?? "?" }))
          .sort((a, b) => a.nome.localeCompare(b.nome))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
      </select>
    </div>
  );
  return { linhas, periodo, filtro };
}

export function QuadroDistChegadas({ dist }: { dist: LinhaDist[] }) {
  const { linhas, periodo, filtro } = useDist(dist);
  const dados = useMemo(() => {
    const m = new Map<string, number>();
    for (let t = Date.parse(periodo.ini); t < Date.parse(periodo.fim); t += 86_400_000) m.set(dataBahia(new Date(t).toISOString()), 0);
    for (const d of linhas) if (dentro(d.criada, periodo.ini, periodo.fim)) m.set(dataBahia(d.criada), (m.get(dataBahia(d.criada)) ?? 0) + 1);
    return [...m.entries()].map(([dia, valor]) => ({ rotulo: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`, valor }));
  }, [linhas, periodo]);
  const per = linhas.filter((d) => dentro(d.criada, periodo.ini, periodo.fim));
  const porOrigem = Object.keys(ORIGEM)
    .map((o) => ({ rotulo: ORIGEM[o], aceita: per.filter((d) => d.origem === o && d.status === "aceita").length, descartada: per.filter((d) => d.origem === o && d.status === "descartada").length, pendente: per.filter((d) => d.origem === o && d.status === "pendente").length }))
    .filter((x) => x.aceita + x.descartada + x.pendente > 0);
  return (
    <Quadro titulo="O que chegou" apoio={`${periodo.rotulo} · ${per.length} itens · ${per.filter((d) => d.status === "aceita").length} aprovados · ${per.filter((d) => d.status === "descartada").length} descartados`} filtro={filtro}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <p className="mb-2 text-xs text-muted">Chegadas por dia</p>
          {dados.length > 62 ? <p className="text-xs text-muted">Escolha um período de até 2 meses para ver por dia.</p> : <Barras dados={dados} />}
        </div>
        <div>
          <p className="mb-2 text-xs text-muted">Por origem e situação</p>
          <BarraSituacao linhas={porOrigem} />
        </div>
      </div>
    </Quadro>
  );
}

export function QuadroDistDecisoes({ dist }: { dist: LinhaDist[] }) {
  const { linhas, periodo, filtro } = useDist(dist);
  const tratadas = linhas.filter((d) => d.tratada && dentro(d.tratada, periodo.ini, periodo.fim));
  const porPessoa = new Map<string, { aceita: number; descartada: number; horas: number[] }>();
  for (const d of tratadas) {
    const k = d.quemDecidiu ?? "Sistema";
    const v = porPessoa.get(k) ?? { aceita: 0, descartada: 0, horas: [] };
    if (d.status === "aceita") v.aceita++;
    if (d.status === "descartada") v.descartada++;
    v.horas.push((Date.parse(d.tratada!) - Date.parse(d.criada)) / 3_600_000);
    porPessoa.set(k, v);
  }
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  };
  const fmt = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);
  return (
    <Quadro titulo="Quem decidiu" apoio={`${tratadas.length} decisões · ${periodo.rotulo.toLowerCase()}`} filtro={filtro}>
      {porPessoa.size === 0 ? (
        <p className="text-sm text-muted">Nenhuma decisão no período.</p>
      ) : (
        <table className="ui-table">
          <thead>
            <tr>
              <th className="py-2 pr-2 font-medium">Pessoa</th>
              <th className="px-2 py-2 text-right font-medium">Aprovou</th>
              <th className="px-2 py-2 text-right font-medium">Descartou</th>
              <th className="py-2 pl-2 text-right font-medium">Tempo até decidir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border tabular-nums">
            {[...porPessoa.entries()]
              .sort((a, b) => b[1].aceita + b[1].descartada - (a[1].aceita + a[1].descartada))
              .map(([nome, v]) => (
                <tr key={nome}>
                  <td className="py-2 pr-2 text-foreground">{nome}</td>
                  <td className="px-2 py-2 text-right text-status-success">{v.aceita}</td>
                  <td className="px-2 py-2 text-right text-status-danger">{v.descartada}</td>
                  <td className="py-2 pl-2 text-right">{fmt(med(v.horas))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </Quadro>
  );
}

export function QuadroDistParados({ dist }: { dist: LinhaDist[] }) {
  const { clientes } = usePainel();
  const [origem, setOrigem] = useState("");
  const hoje = hojeBahia();
  const parados = dist.filter((d) => d.status === "pendente" && (!origem || d.origem === origem)).sort((a, b) => a.criada.localeCompare(b.criada));
  return (
    <Quadro
      titulo="Esperando decisão"
      apoio={`${parados.length} pendentes · mais antigos primeiro`}
      filtro={
        <select aria-label="Origem" className={sel} value={origem} onChange={(e) => setOrigem(e.target.value)}>
          <option value="">Todas as origens</option>
          {Object.entries(ORIGEM).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </select>
      }
    >
      <ul>
        {parados.slice(0, 12).map((d) => {
          const diasP = Math.floor((Date.parse(`${hoje}T15:00:00Z`) - Date.parse(d.criada)) / 86_400_000);
          return (
            <li key={d.id} className="border-t border-border first:border-t-0">
              <Link href={`/admin/distribuicao?origem=${d.origem}`} className="flex items-center gap-3 rounded-md py-2 hover:bg-[var(--hover)]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{d.clienteId ? clientes.get(d.clienteId)?.nome ?? "?" : "Sem cliente"}</span>
                  <span className="block truncate text-xs text-muted">
                    {d.titulo} · {ORIGEM[d.origem] ?? d.origem}
                  </span>
                </span>
                <span className={`shrink-0 text-xs font-medium tabular-nums ${diasP > 2 ? "text-status-danger" : "text-muted"}`}>{diasP} d</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {parados.length > 12 && (
        <Link href="/admin/distribuicao" className="mt-2 inline-block text-xs text-muted hover:text-foreground hover:underline">
          Ver todos ({parados.length})
        </Link>
      )}
    </Quadro>
  );
}

/* ───────── Prazos e Agenda ───────── */

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const diaSemana = (d: string) => SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()];

/** Próximos 14 dias: prazos e audiências por dia. */
export function QuadroAgenda() {
  const { filtro, setFiltro, linhas } = useFiltro();
  const hoje = hojeBahia();
  const dias = Array.from({ length: 14 }, (_, k) => somaDias(hoje, k));
  const porDia = dias.map((d) => ({ d, itens: linhas.filter((a) => aberta(a) && a.prazo === d).sort((a, b) => (a.hora ?? "99").localeCompare(b.hora ?? "99")) })).filter((x) => x.itens.length);
  return (
    <Quadro titulo="Próximos 14 dias" apoio="Quem tem o quê, para qual cliente, em cada dia" filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} campos={{ resp: true, cliente: true, tipo: true }} />}>
      {porDia.length === 0 ? (
        <p className="text-sm text-muted">Nada com prazo nos próximos 14 dias.</p>
      ) : (
        <div className="space-y-4">
          {porDia.map(({ d, itens }) => (
            <div key={d}>
              <p className="eyebrow mb-1">
                {d === hoje ? "Hoje" : d === somaDias(hoje, 1) ? "Amanhã" : diaSemana(d)} · {d.slice(8, 10)}/{d.slice(5, 7)} · {itens.length}
              </p>
              <ul>
                {itens.map((a) => (
                  <LinhaAgenda
                    key={a.id}
                    a={a}
                    etiqueta={
                      a.categoria === "audiencia" ? (
                        <span className="shrink-0 rounded-full bg-status-info-bg px-2 py-0.5 text-[10px] font-medium text-status-info">Audiência</span>
                      ) : a.categoria === "prazo" ? (
                        <span className="shrink-0 rounded-full bg-status-pending-bg px-2 py-0.5 text-[10px] font-medium text-status-pending">Prazo</span>
                      ) : undefined
                    }
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Quadro>
  );
}

/** Pessoa × próximos 7 dias: quantas coisas vencem e o peso. */
export function QuadroCargaSemana({ equipe }: { equipe: string[] }) {
  const { filtro, setFiltro, linhas } = useFiltro();
  const { responsaveis } = usePainel();
  const hoje = hojeBahia();
  const dias = Array.from({ length: 7 }, (_, k) => somaDias(hoje, k));
  const pessoas = responsaveis.filter((r) => equipe.includes(r.id));
  const celula = (rid: string, d: string) => linhas.filter((a) => a.respId === rid && aberta(a) && a.prazo === d);
  const max = Math.max(1, ...pessoas.flatMap((r) => dias.map((d) => celula(r.id, d).reduce((s, a) => s + pesoAtividade(a, hoje), 0))));
  return (
    <Quadro titulo="Carga de cada um nos próximos 7 dias" apoio="Número de itens vencendo por dia · cor = peso estimado" filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} campos={{ cliente: true, tipo: true }} />}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-separate border-spacing-[3px] text-xs">
          <thead>
            <tr>
              <th className="text-left font-normal text-muted">Pessoa</th>
              {dias.map((d) => (
                <th key={d} className="text-center font-normal text-muted">
                  {d === hoje ? "hoje" : diaSemana(d)} {d.slice(8, 10)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pessoas.map((r) => (
              <tr key={r.id}>
                <td className="pr-2">
                  <span className="flex items-center gap-2 truncate text-foreground">
                    <Avatar nome={r.nome} foto={r.foto} tamanho={24} />
                    {r.nome}
                  </span>
                </td>
                {dias.map((d) => {
                  const its = celula(r.id, d);
                  const peso = its.reduce((s, a) => s + pesoAtividade(a, hoje), 0);
                  return (
                    <td
                      key={d}
                      title={its.length ? its.map((a) => `${a.hora ? a.hora + " " : ""}${a.titulo}`).join("\n") : "Nada"}
                      className={`h-8 rounded-[4px] text-center tabular-nums ${peso / max > 0.55 ? "text-white" : "text-foreground"}`}
                      style={{ background: its.length ? `color-mix(in oklab, ${COR_2} ${Math.round(20 + (peso / max) * 80)}%, transparent)` : "var(--surface-2)" }}
                    >
                      {its.length || ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Quadro>
  );
}

/** Vencidas sem fazer, por pessoa. */
export function QuadroVencidas() {
  const { filtro, setFiltro, linhas } = useFiltro();
  const hoje = hojeBahia();
  const venc = linhas.filter((a) => atrasada(a, hoje)).sort((a, b) => a.prazo!.localeCompare(b.prazo!));
  const diasAtraso = (p: string) => Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${p}T12:00:00Z`)) / 86_400_000);
  return (
    <Quadro titulo="Quem deixou atrasar" apoio={`${venc.length} atividade(s) venceram sem ser feitas`} filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} campos={{ resp: true, cliente: true, tipo: true }} />}>
      <PorResponsavel
        itens={venc}
        vazio="Nada atrasado com esse filtro. 👏"
        rotuloContagem={(n) => `${n} atrasada${n > 1 ? "s" : ""}`}
        direita={(a) => ({ texto: `venceu ${a.prazo!.slice(8, 10)}/${a.prazo!.slice(5, 7)} · ${diasAtraso(a.prazo!)} d`, tom: "text-status-danger" })}
      />
    </Quadro>
  );
}

/** Atividades da ficha de um cliente (com filtro próprio). */
export function AtividadesDoCliente({ clienteId }: { clienteId: string }) {
  const { filtro, setFiltro, linhas, periodo } = useFiltro({ cliente: clienteId });
  const { responsaveis } = usePainel();
  const hoje = hojeBahia();
  const minhas = linhas.filter((a) => a.clienteId === clienteId);
  const abertas = minhas.filter(aberta).sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
  const concl = minhas.filter((a) => a.status === "concluida" && dentro(a.concluida, periodo.ini, periodo.fim)).sort((a, b) => b.concluida!.localeCompare(a.concluida!));
  const nomeResp = (id: string | null) => responsaveis.find((r) => r.id === id)?.nome ?? "sem responsável";
  const Linha = ({ a, direita, tom }: { a: (typeof minhas)[number]; direita: string; tom?: string }) => (
    <li className="border-t border-border first:border-t-0">
      <Link href={`/admin/activities/${a.id}`} className="flex items-center gap-3 rounded-md py-2 hover:bg-[var(--hover)]">
        <Avatar nome={nomeResp(a.respId)} foto={responsaveis.find((r) => r.id === a.respId)?.foto} tamanho={26} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{nomeResp(a.respId)}</span>
          <span className="block truncate text-xs text-muted">{a.titulo}</span>
        </span>
        <span className={`shrink-0 text-xs tabular-nums ${tom ?? "text-muted"}`}>{direita}</span>
      </Link>
    </li>
  );
  return (
    <Quadro titulo="Atividades" apoio={`${abertas.length} abertas · ${concl.length} concluídas (${periodo.rotulo.toLowerCase()})`} filtro={<FiltroQuadro filtro={filtro} setFiltro={setFiltro} campos={{ periodo: true, resp: true, tipo: true }} />}>
      <p className="eyebrow mb-1">Abertas</p>
      {abertas.length === 0 ? <p className="py-1 text-xs text-muted">Nenhuma.</p> : <ul>{abertas.map((a) => <Linha key={a.id} a={a} direita={a.prazo ? `${atrasada(a, hoje) ? "venceu" : "vence"} ${a.prazo.slice(8, 10)}/${a.prazo.slice(5, 7)}` : "sem prazo"} tom={atrasada(a, hoje) ? "text-status-danger" : undefined} />)}</ul>}
      <p className="eyebrow mb-1 mt-4">Concluídas no período</p>
      {concl.length === 0 ? <p className="py-1 text-xs text-muted">Nenhuma.</p> : <ul>{concl.map((a) => <Linha key={a.id} a={a} direita={`${dataBahia(a.concluida!).slice(8, 10)}/${dataBahia(a.concluida!).slice(5, 7)}`} />)}</ul>}
    </Quadro>
  );
}
