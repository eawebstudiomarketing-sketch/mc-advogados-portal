import Link from "next/link";
import { CheckCircle2, Monitor, Smartphone, Tablet } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { StatCard } from "@/components/ui/stat-card";
import { listarFormularios } from "@/lib/crm/dados";
import { listarVisitas, SAIU, type Visita } from "@/lib/crm/visitas";
import { AtualizarSozinho } from "./atualizar";

// Pixel próprio do CRM (06/11/2026): quem entrou nos formulários, de onde veio,
// em que aparelho e cidade, até qual pergunta foi e onde desistiu. Quem enviou
// leva ao lead. A tela se atualiza sozinha a cada 30 s.

const PERIODOS = [1, 7, 30, 90] as const;
const agora = () => Date.now();
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const duracao = (ms: number) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);
const mediana = (v: number[]) => {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
};
const ICONE_APARELHO = { Celular: Smartphone, Tablet, Computador: Monitor } as const;

function contar<T>(lista: T[], chave: (x: T) => string | null | undefined) {
  const m = new Map<string, T[]>();
  for (const x of lista) {
    const k = chave(x) || "—";
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return [...m].sort((a, b) => b[1].length - a[1].length);
}

function Barras({ itens }: { itens: { rotulo: string; n: number; extra?: string }[] }) {
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
              {i.extra ? ` · ${i.extra}` : ""}
            </span>
          </div>
          <div className="h-2 rounded-full bg-track">
            <div className="h-full rounded-full bg-navy-3" style={{ width: `${(i.n / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function VisitasPage({ searchParams }: { searchParams: Promise<{ dias?: string; form?: string }> }) {
  await exigirPermissao("comercial");
  const sp = await searchParams;
  const n = Number(sp.dias);
  const dias = (PERIODOS as readonly number[]).includes(n) ? n : 7;
  const forms = await listarFormularios();
  const desde = new Date(agora() - dias * 86_400_000).toISOString();
  const todas = await listarVisitas({ desde, formulario: sp.form && forms.some((f) => f.id === sp.form) ? sp.form : undefined });
  const formSel = forms.find((f) => f.id === sp.form) ?? forms.find((f) => todas.some((v) => v.formulario_id === f.id)) ?? forms[0];
  const nomeForm = new Map(forms.map((f) => [f.id, f.nome]));

  const comecou = (v: Visita) => v.passo_max >= 0;
  const visitantes = new Set(todas.map((v) => v.visitante)).size;
  const enviaram = todas.filter((v) => v.enviou).length;
  const emAndamento = (v: Visita) => !v.enviou && v.passo_atual !== SAIU && agora() - Date.parse(v.ultimo_em) < 3 * 60_000;
  const aoVivo = todas.filter(emAndamento).length;
  const vezes = new Map<string, number>();
  const porVisitante = new Map<string, number>();
  for (const v of [...todas].reverse()) {
    const n = (porVisitante.get(v.visitante) ?? 0) + 1;
    porVisitante.set(v.visitante, n);
    vezes.set(`${v.visitante}:${v.id}`, n);
  }

  // funil por pergunta do formulário escolhido
  const doForm = formSel ? todas.filter((v) => v.formulario_id === formSel.id) : [];
  const campos = formSel?.config.campos ?? [];
  const degraus = [
    { rotulo: "Abriram o formulário", n: doForm.length, tempo: null as number | null },
    ...campos.map((c, i) => ({ rotulo: `${i + 1}. ${c.titulo}`, n: doForm.filter((v) => v.passo_max >= i || v.enviou).length, tempo: mediana(doForm.map((v) => v.tempos?.[c.id]).filter((x): x is number => typeof x === "number" && x > 0)) })),
    { rotulo: "Enviaram", n: doForm.filter((v) => v.enviou).length, tempo: null },
  ];
  let pior = { i: -1, perda: 0 };
  degraus.forEach((d, i) => {
    if (i === 0) return;
    const perda = degraus[i - 1].n - d.n;
    if (perda > pior.perda) pior = { i, perda };
  });

  const linkP = (q: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const m = { dias, form: sp.form, ...q };
    if (m.dias && m.dias !== 7) u.set("dias", String(m.dias));
    if (m.form) u.set("form", String(m.form));
    const s = u.toString();
    return `/admin/comercial/visitas${s ? `?${s}` : ""}`;
  };
  const ateOnde = (v: Visita) => {
    if (v.enviou) return null;
    if (v.passo_max < 0) return "Só viu a abertura";
    const c = forms.find((f) => f.id === v.formulario_id)?.config.campos[v.passo_max];
    return `Parou na ${v.passo_max + 1} de ${v.total_passos || "?"}${c ? `: ${c.titulo}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <AtualizarSozinho />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Comercial · Pixel próprio</p>
          <h1 className="page-title">Visitas dos formulários</h1>
          <p className="text-sm text-muted">Quem entrou, de onde veio e até onde foi. Quem não envia fica anônimo: guardamos só o caminho, não o que foi digitado.</p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Período">
          {PERIODOS.map((p) => (
            <Link key={p} href={linkP({ dias: p })} aria-current={p === dias ? "page" : undefined} className={`inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium ${p === dias ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/75 hover:text-foreground"}`}>
              {p === 1 ? "Hoje" : `${p} dias`}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Agora no formulário" value={String(aoVivo)} tone={aoVivo ? "info" : "default"} hint="últimos 3 minutos" />
        <StatCard label="Visitas" value={String(todas.length)} hint={`${visitantes} ${visitantes === 1 ? "pessoa (aparelho)" : "pessoas (aparelhos)"}`} />
        <StatCard label="Começaram" value={String(todas.filter(comecou).length)} hint={pct(todas.filter(comecou).length, todas.length)} />
        <StatCard label="Enviaram" value={String(enviaram)} hint={`${pct(enviaram, todas.length)} das visitas`} tone="success" />
        <StatCard label="Desistiram no meio" value={String(todas.filter((v) => comecou(v) && !v.enviou).length)} tone="pending" />
      </div>

      <section className="ui-card p-5" aria-labelledby="funil">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="funil" className="section-title">
            Onde desistem
          </h2>
          <nav className="flex flex-wrap gap-1.5" aria-label="Formulário">
            {forms.map((f) => (
              <Link key={f.id} href={linkP({ form: f.id })} aria-current={f.id === formSel?.id ? "page" : undefined} className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium ${f.id === formSel?.id ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/75"}`}>
                {f.nome}
              </Link>
            ))}
          </nav>
        </div>
        {doForm.length === 0 ? (
          <p className="text-sm text-muted">Ninguém abriu este formulário no período.</p>
        ) : (
          <ol className="space-y-2">
            {degraus.map((d, i) => {
              const largura = (d.n / Math.max(1, degraus[0].n)) * 100;
              const perda = i > 0 ? degraus[i - 1].n - d.n : 0;
              return (
                <li key={d.rotulo} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_auto]">
                  <span className={`truncate text-sm ${i === pior.i ? "font-semibold text-status-danger" : "text-foreground"}`} title={d.rotulo}>
                    {d.rotulo}
                  </span>
                  <div className="col-span-2 h-6 overflow-hidden rounded-md bg-track sm:col-span-1">
                    <div className={`flex h-full items-center rounded-md px-2 text-[11px] font-semibold text-white ${i === degraus.length - 1 ? "bg-status-success" : i === pior.i ? "bg-status-danger" : "bg-navy-3"}`} style={{ width: `${Math.max(largura, 4)}%` }}>
                      {d.n}
                    </div>
                  </div>
                  <span className="row-start-1 text-right text-xs text-muted tabular-nums sm:row-auto">
                    {pct(d.n, degraus[0].n)}
                    {perda > 0 && <span className="text-status-danger"> · −{perda}</span>}
                    {d.tempo ? ` · ${duracao(d.tempo)}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {pior.i > 0 && (
          <p className="mt-4 text-sm text-muted">
            A maior perda é em <strong className="text-foreground">{degraus[pior.i].rotulo.replace(/^\d+\.\s*/, "")}</strong>: {pior.perda} pessoa{pior.perda > 1 ? "s" : ""} saíram aí. O tempo é a mediana de quanto ficam em cada pergunta.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="ui-card p-5" aria-labelledby="canais">
          <h2 id="canais" className="section-title mb-4">
            De onde vêm
          </h2>
          <Barras itens={contar(todas, (v) => v.canal).map(([k, v]) => ({ rotulo: k, n: v.length, extra: `${v.filter((x) => x.enviou).length} enviaram (${pct(v.filter((x) => x.enviou).length, v.length)})` }))} />
        </section>
        <section className="ui-card p-5" aria-labelledby="campanhas">
          <h2 id="campanhas" className="section-title mb-4">
            Campanhas e anúncios
          </h2>
          <Barras
            itens={contar(
              todas.filter((v) => v.utm?.campaign || v.utm?.content),
              (v) => [v.utm?.campaign, v.utm?.content].filter(Boolean).join(" · "),
            ).map(([k, v]) => ({ rotulo: k, n: v.length, extra: `${v.filter((x) => x.enviou).length} enviaram` }))}
          />
          <p className="mt-3 text-xs text-muted">Aparece quando o link do anúncio tem utm_campaign (e utm_content para o anúncio).</p>
        </section>
        <section className="ui-card p-5" aria-labelledby="onde">
          <h2 id="onde" className="section-title mb-4">
            Aparelho e cidade
          </h2>
          <Barras itens={contar(todas, (v) => [v.aparelho, v.sistema].filter(Boolean).join(" · ")).slice(0, 5).map(([k, v]) => ({ rotulo: k, n: v.length }))} />
          <div className="mt-5">
            <Barras itens={contar(todas, (v) => (v.cidade ? `${v.cidade}${v.uf ? ` (${v.uf})` : ""}` : "Cidade não identificada")).slice(0, 6).map(([k, v]) => ({ rotulo: k, n: v.length }))} />
          </div>
        </section>
      </div>

      <section className="ui-card overflow-hidden" aria-labelledby="lista">
        <h2 id="lista" className="section-title px-5 pt-5">
          Últimas visitas
        </h2>
        <ul className="mt-3 divide-y divide-border">
          {todas.slice(0, 100).map((v) => {
            const Icone = ICONE_APARELHO[(v.aparelho ?? "Computador") as keyof typeof ICONE_APARELHO] ?? Monitor;
            const vez = vezes.get(`${v.visitante}:${v.id}`) ?? 1;
            const parou = ateOnde(v);
            const vivo = emAndamento(v);
            return (
              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="w-24 shrink-0 text-xs text-muted tabular-nums">{hora(v.inicio)}</span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Icone className="h-4 w-4 shrink-0 text-muted" aria-label={v.aparelho ?? ""} />
                  <span className="truncate text-foreground">
                    {v.canal ?? "Link direto"}
                    {v.utm?.campaign ? <span className="text-muted"> · {v.utm.campaign}</span> : null}
                  </span>
                </span>
                <span className="w-40 shrink-0 truncate text-xs text-muted">
                  {[v.cidade, v.sistema].filter(Boolean).join(" · ") || "—"}
                  {vez > 1 ? ` · ${vez}ª visita` : ""}
                </span>
                <span className="hidden w-40 shrink-0 truncate text-xs text-muted lg:block">{nomeForm.get(v.formulario_id)}</span>
                <span className="w-64 shrink-0 truncate text-xs">
                  {v.enviou ? (
                    v.lead_id ? (
                      <Link href={`/admin/comercial/${v.lead_id}`} className="inline-flex items-center gap-1 font-semibold text-status-success hover:underline">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Enviou · abrir o lead
                      </Link>
                    ) : (
                      <span className="font-semibold text-status-success">Enviou</span>
                    )
                  ) : (
                    <span className={vivo ? "font-semibold text-status-info" : "text-status-pending"}>{vivo ? `Preenchendo agora · ${parou}` : parou}</span>
                  )}
                </span>
                <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums">{duracao(Date.parse(v.ultimo_em) - Date.parse(v.inicio))}</span>
              </li>
            );
          })}
          {todas.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">Nenhuma visita no período. Assim que alguém abrir um formulário, aparece aqui.</li>}
        </ul>
      </section>
    </div>
  );
}
