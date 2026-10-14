import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";

// Agenda: prazos, audiências e tarefas com data, num calendário do mês.
// Lê as mesmas atividades do portal (cada um vê as que já pode ver).

type Item = {
  id: string;
  title: string;
  deadline: string;
  hora: string | null;
  categoria: string;
  status: string;
  clients: { name: string } | null;
};

const COR: Record<string, string> = {
  audiencia: "border-l-gold bg-gold/15 text-navy",
  prazo: "border-l-status-danger bg-status-danger-bg text-status-danger",
  tarefa: "border-l-status-info bg-status-info-bg text-status-info",
};
const ROTULO: Record<string, string> = { audiencia: "Audiência", prazo: "Prazo", tarefa: "Tarefa" };
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const hojeBahia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
const dataBR = (s: string) => s.split("-").reverse().join("/");

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ mes?: string; ver?: string }> }) {
  await exigirPermissao("atividades");
  const { mes, ver } = await searchParams;
  const hoje = hojeBahia();
  const [ano, m] = (/^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : hoje.slice(0, 7)).split("-").map(Number);
  const primeiro = new Date(Date.UTC(ano, m - 1, 1));
  const inicioGrade = new Date(primeiro);
  inicioGrade.setUTCDate(1 - primeiro.getUTCDay());
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrade);
    d.setUTCDate(inicioGrade.getUTCDate() + i);
    return iso(d);
  });
  const fimLista = (() => {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 14);
    return iso(d);
  })();
  const mostrarConcluidas = ver === "todas";

  const supabase = await createClient();
  let q = supabase
    .from("activities")
    .select("id, title, deadline, hora, categoria, status, clients(name)")
    .is("archived_at", null)
    .not("deadline", "is", null)
    .gte("deadline", dias[0] < hoje ? dias[0] : hoje)
    .lte("deadline", dias[41] > fimLista ? dias[41] : fimLista)
    .order("deadline")
    .order("hora", { nullsFirst: true });
  if (!mostrarConcluidas) q = q.in("status", ["aberta", "em_andamento"]);
  const { data } = await q;
  const itens = (data ?? []) as unknown as Item[];

  const porDia = new Map<string, Item[]>();
  for (const it of itens) porDia.set(it.deadline, [...(porDia.get(it.deadline) ?? []), it]);
  const proximos = itens.filter((i) => i.deadline >= hoje && i.deadline <= fimLista && (i.status === "aberta" || i.status === "em_andamento"));

  const mesAnterior = `${m === 1 ? ano - 1 : ano}-${pad(m === 1 ? 12 : m - 1)}`;
  const mesSeguinte = `${m === 12 ? ano + 1 : ano}-${pad(m === 12 ? 1 : m + 1)}`;
  const qsVer = mostrarConcluidas ? "&ver=todas" : "";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="text-sm text-muted">Prazos, audiências e tarefas com data. Vêm das atividades — inclusive as criadas a partir das publicações.</p>
        </div>
        <Link href="/admin/activities/new" className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> Nova atividade
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
        <section className="ui-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-1">
              <Link href={`/admin/agenda?mes=${mesAnterior}${qsVer}`} className="icon-btn" aria-label="Mês anterior" data-tip="Mês anterior">
                <ChevronLeft aria-hidden />
              </Link>
              <h2 className="min-w-40 text-center text-sm font-semibold text-foreground capitalize">
                {MESES[m - 1]} de {ano}
              </h2>
              <Link href={`/admin/agenda?mes=${mesSeguinte}${qsVer}`} className="icon-btn" aria-label="Próximo mês" data-tip="Próximo mês">
                <ChevronRight aria-hidden />
              </Link>
              <Link href={`/admin/agenda${mostrarConcluidas ? "?ver=todas" : ""}`} className="ml-2 text-xs font-medium text-navy-3 hover:underline">
                Hoje
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
              {Object.entries(ROTULO).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-sm border-l-2 ${COR[k]}`} aria-hidden /> {v}
                </span>
              ))}
              <Link
                href={`/admin/agenda?mes=${ano}-${pad(m)}${mostrarConcluidas ? "" : "&ver=todas"}`}
                className="font-medium text-navy-3 hover:underline"
              >
                {mostrarConcluidas ? "Ocultar concluídas" : "Mostrar concluídas"}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-[11px] font-medium text-muted">
            {DIAS.map((d) => (
              <div key={d} className="py-1.5">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {dias.map((d) => {
              const doMes = d.slice(0, 7) === `${ano}-${pad(m)}`;
              const lista = porDia.get(d) ?? [];
              return (
                <div key={d} className={`min-h-24 border-r border-b border-border p-1.5 [&:nth-child(7n)]:border-r-0 ${doMes ? "" : "bg-surface-2/60"}`}>
                  <p
                    className={`mb-1 text-right text-[11px] ${
                      d === hoje ? "ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-navy font-semibold text-white" : doMes ? "text-foreground/70" : "text-muted/60"
                    }`}
                  >
                    {Number(d.slice(8))}
                  </p>
                  <ul className="space-y-1">
                    {lista.slice(0, 3).map((it) => (
                      <li key={it.id}>
                        <Link
                          href={`/admin/activities/${it.id}`}
                          title={`${ROTULO[it.categoria] ?? "Tarefa"}${it.hora ? ` às ${it.hora.slice(0, 5)}` : ""}: ${it.title}${it.clients ? ` · ${it.clients.name}` : ""}`}
                          className={`block truncate rounded border-l-2 px-1.5 py-0.5 text-[11px] leading-tight hover:brightness-95 ${COR[it.categoria] ?? COR.tarefa} ${
                            it.status === "concluida" || it.status === "cancelada" ? "line-through opacity-60" : ""
                          } ${d < hoje && (it.status === "aberta" || it.status === "em_andamento") ? "ring-1 ring-status-danger" : ""}`}
                        >
                          {it.hora ? <strong className="font-semibold">{it.hora.slice(0, 5)} </strong> : null}
                          {it.title}
                        </Link>
                      </li>
                    ))}
                    {lista.length > 3 && (
                      <li className="px-1 text-[10px] text-muted">
                        <Link href={`/admin/activities`} className="hover:underline">
                          +{lista.length - 3} mais
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="ui-card h-fit p-5">
          <h2 className="section-title">Próximos 14 dias</h2>
          {proximos.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nada com data nos próximos 14 dias.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {proximos.map((it) => (
                <li key={it.id}>
                  <Link href={`/admin/activities/${it.id}`} className="group block">
                    <p className="text-xs text-muted">
                      {it.deadline === hoje ? <span className="font-semibold text-status-pending">Hoje</span> : dataBR(it.deadline)}
                      {it.hora ? ` · ${it.hora.slice(0, 5)}` : ""} ·{" "}
                      <span className={it.categoria === "prazo" ? "text-status-danger" : it.categoria === "audiencia" ? "font-medium text-navy" : ""}>
                        {ROTULO[it.categoria] ?? "Tarefa"}
                      </span>
                    </p>
                    <p className="text-sm text-foreground group-hover:underline">{it.title}</p>
                    {it.clients && <p className="text-xs text-muted">{it.clients.name}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
