import Link from "next/link";
import { exigirPermissao } from "@/lib/dal";
import { StatCard } from "@/components/ui/stat-card";
import { equipeComercial, funilDosFormularios, listarEtapas, listarFormularios, listarLeads } from "@/lib/crm/dados";
import { COR_ETAPA } from "@/lib/crm/tipos";

// Números do CRM (06/11/2026): leads por dia, de onde vêm, conversão de cada
// formulário, tempo até o primeiro contato, quem fecha e por que perde.

const PERIODOS = [7, 30, 90] as const;
const dia = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(iso));
const agora = () => Date.now();
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Barras({ itens, total }: { itens: { rotulo: string; n: number; extra?: string; cor?: string }[]; total?: number }) {
  const max = Math.max(1, ...itens.map((i) => i.n));
  if (!itens.length) return <p className="text-sm text-muted">Nada no período.</p>;
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.rotulo}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-foreground">{i.rotulo}</span>
            <span className="shrink-0 tabular-nums text-muted">
              <strong className="font-semibold text-foreground">{i.n}</strong>
              {total ? ` · ${pct(i.n, total)}` : ""}
              {i.extra ? ` · ${i.extra}` : ""}
            </span>
          </div>
          <div className="h-2 rounded-full bg-track">
            <div className={`h-full rounded-full ${i.cor ?? "bg-navy-3"}`} style={{ width: `${(i.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function NumerosPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await exigirPermissao("comercial");
  const n = Number((await searchParams).dias);
  const dias = (PERIODOS as readonly number[]).includes(n) ? n : 30;
  const desde = new Date(agora() - dias * 86_400_000).toISOString();
  const [leads, etapas, forms, funil, equipe] = await Promise.all([listarLeads({ desde }), listarEtapas(), listarFormularios(), funilDosFormularios(desde), equipeComercial()]);
  const tipo = new Map(etapas.map((e) => [e.id, e.tipo]));
  const ganhos = leads.filter((l) => tipo.get(l.etapa_id ?? "") === "ganho");
  const perdidos = leads.filter((l) => tipo.get(l.etapa_id ?? "") === "perdido");
  const valor = ganhos.reduce((s, l) => s + (l.valor ?? 0), 0);
  const tempos = leads.filter((l) => l.primeiro_contato_em).map((l) => (Date.parse(l.primeiro_contato_em!) - Date.parse(l.created_at)) / 3_600_000);
  const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;

  // leads por dia (o período inteiro, com zeros)
  const porDia = new Map<string, number>();
  for (let i = dias - 1; i >= 0; i--) porDia.set(dia(new Date(agora() - i * 86_400_000).toISOString()), 0);
  for (const l of leads) porDia.set(dia(l.created_at), (porDia.get(dia(l.created_at)) ?? 0) + 1);
  const maxDia = Math.max(1, ...porDia.values());

  const canal = (l: (typeof leads)[number]) => (l.rastreio?.fbclid ? "Anúncio Meta" : l.rastreio?.gclid ? "Anúncio Google" : l.utm?.source ? l.utm.source : l.formulario_id ? "Link direto" : l.origem);
  const contar = <T,>(lista: T[], chave: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of lista) m.set(chave(x), [...(m.get(chave(x)) ?? []), x]);
    return [...m].sort((a, b) => b[1].length - a[1].length);
  };
  const ehGanho = (l: (typeof leads)[number]) => tipo.get(l.etapa_id ?? "") === "ganho";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Comercial · CRM</p>
          <h1 className="page-title">Números</h1>
          <p className="text-sm text-muted">Leads que chegaram nos últimos {dias} dias e o que aconteceu com eles.</p>
        </div>
        <nav className="flex gap-1.5" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link key={p} href={`/admin/comercial/numeros?dias=${p}`} aria-current={p === dias ? "page" : undefined} className={`inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium ${p === dias ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/75 hover:text-foreground"}`}>
              {p} dias
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Leads" value={String(leads.length)} tone="info" />
        <StatCard label="Fechados" value={String(ganhos.length)} hint={`${pct(ganhos.length, leads.length)} de conversão${valor ? ` · ${brl(valor)}` : ""}`} tone="success" />
        <StatCard label="Perdidos" value={String(perdidos.length)} tone={perdidos.length ? "danger" : "default"} />
        <StatCard label="1º contato em" value={tempoMedio === null ? "—" : tempoMedio < 1 ? `${Math.round(tempoMedio * 60)} min` : `${tempoMedio.toFixed(1).replace(".", ",")} h`} hint="média (do formulário até alguém chamar)" tone={tempoMedio !== null && tempoMedio > 2 ? "pending" : "default"} />
      </div>

      <section className="ui-card p-5" aria-labelledby="por-dia">
        <h2 id="por-dia" className="section-title mb-4">
          Leads por dia
        </h2>
        <div className="flex h-36 items-end gap-[3px]">
          {[...porDia].map(([d, q]) => (
            <div key={d} className="group relative flex-1" title={`${d.split("-").reverse().slice(0, 2).join("/")}: ${q}`}>
              <div className={`w-full rounded-t ${q ? "bg-navy-3" : "bg-track"}`} style={{ height: `${Math.max((q / maxDia) * 128, 3)}px` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span>{[...porDia.keys()][0]?.split("-").reverse().slice(0, 2).join("/")}</span>
          <span>hoje</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="ui-card p-5" aria-labelledby="funil-forms">
          <h2 id="funil-forms" className="section-title mb-4">
            Formulários: quem abre, começa e envia
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-2 font-medium">Formulário</th>
                  <th className="pb-2 text-right font-medium">Abriram</th>
                  <th className="pb-2 text-right font-medium">Começaram</th>
                  <th className="pb-2 text-right font-medium">Enviaram</th>
                  <th className="pb-2 text-right font-medium">Fecharam</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {forms.map((f) => {
                  const x = funil.get(f.id) ?? { abriu: 0, comecou: 0, enviou: 0 };
                  const fech = ganhos.filter((l) => l.formulario_id === f.id).length;
                  return (
                    <tr key={f.id} className="border-t border-border">
                      <td className="py-2 pr-2 text-foreground">{f.nome}</td>
                      <td className="py-2 text-right">{x.abriu}</td>
                      <td className="py-2 text-right">
                        {x.comecou} <span className="text-xs text-muted">{pct(x.comecou, x.abriu)}</span>
                      </td>
                      <td className="py-2 text-right">
                        {x.enviou} <span className="text-xs text-muted">{pct(x.enviou, x.abriu)}</span>
                      </td>
                      <td className="py-2 text-right">{fech}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="ui-card p-5" aria-labelledby="canais">
          <h2 id="canais" className="section-title mb-4">
            De onde vêm (e quantos fecham)
          </h2>
          <Barras itens={contar(leads, canal).map(([k, v]) => ({ rotulo: k, n: v.length, extra: `${v.filter(ehGanho).length} fechados` }))} total={leads.length} />
        </section>

        <section className="ui-card p-5" aria-labelledby="campanhas">
          <h2 id="campanhas" className="section-title mb-4">
            Campanhas (utm_campaign)
          </h2>
          <Barras itens={contar(leads.filter((l) => l.utm?.campaign), (l) => l.utm.campaign).map(([k, v]) => ({ rotulo: k, n: v.length, extra: `${v.filter(ehGanho).length} fechados` }))} />
        </section>

        <section className="ui-card p-5" aria-labelledby="etapas">
          <h2 id="etapas" className="section-title mb-4">
            Onde estão agora
          </h2>
          <Barras itens={etapas.map((e) => ({ rotulo: e.nome, n: leads.filter((l) => l.etapa_id === e.id).length, cor: (COR_ETAPA[e.cor] ?? COR_ETAPA.navy).ponto }))} total={leads.length} />
        </section>

        <section className="ui-card p-5" aria-labelledby="pessoas">
          <h2 id="pessoas" className="section-title mb-4">
            Por responsável
          </h2>
          <Barras
            itens={contar(leads, (l) => equipe.find((p) => p.id === l.responsavel)?.nome ?? "Sem responsável").map(([k, v]) => ({
              rotulo: k,
              n: v.length,
              extra: `${v.filter(ehGanho).length} fechados (${pct(v.filter(ehGanho).length, v.length)})`,
            }))}
          />
        </section>

        <section className="ui-card p-5" aria-labelledby="perdas">
          <h2 id="perdas" className="section-title mb-4">
            Por que perdemos
          </h2>
          <Barras itens={contar(perdidos, (l) => l.motivo_perda ?? "Sem motivo").map(([k, v]) => ({ rotulo: k, n: v.length, cor: "bg-status-danger" }))} total={perdidos.length} />
        </section>
      </div>
    </div>
  );
}
