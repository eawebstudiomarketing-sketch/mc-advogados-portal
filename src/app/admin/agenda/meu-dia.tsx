import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarClock, Gavel, AlertTriangle, CalendarRange, Coffee } from "lucide-react";
import { diaDaPessoa, type AtividadeDoDia } from "@/lib/data/rotina";
import { SeletorPessoa, EnviarRotinaAgora } from "./meu-dia-controles";

// "Meu dia": a mesma rotina que vai no WhatsApp às 7h, na tela. O admin (ou
// quem tem a permissão) escolhe de quem é o dia.

const ROTULO_CAT: Record<string, string> = { prazo: "Prazo", audiencia: "Audiência", tarefa: "Tarefa" };
const ROTULO_TIPO: Record<string, string> = { reuniao: "Reunião", ligacao: "Ligação", evento: "Evento", outro: "Compromisso" };
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

function ListaAtividades({ itens, mostrarData }: { itens: AtividadeDoDia[]; mostrarData?: boolean }) {
  return (
    <ul className="divide-y divide-border">
      {itens.map((a) => (
        <li key={a.id}>
          <Link href={`/admin/activities/${a.id}`} className="flex items-center gap-3 px-1 py-2 text-sm hover:bg-surface-2">
            <span className="w-14 shrink-0 text-xs text-muted tabular-nums">{mostrarData && a.prazo ? dataCurta(a.prazo) : a.hora ? a.hora.slice(0, 5) : "—"}</span>
            <span className="min-w-0 flex-1 truncate text-foreground">{a.titulo}</span>
            {a.cliente && <span className="hidden max-w-48 truncate text-xs text-muted sm:inline">{a.cliente}</span>}
            <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted">{ROTULO_CAT[a.categoria] ?? "Tarefa"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export async function MeuDia({
  pessoaId,
  dia,
  hoje,
  pessoas,
  ehAdmin,
}: {
  pessoaId: string | null;
  dia: string;
  hoje: string;
  pessoas: { id: string; nome: string; temZap: boolean }[] | null;
  ehAdmin: boolean;
}) {
  if (!pessoaId) return <p className="ui-card p-6 text-sm text-muted">Seu usuário ainda não está na lista de responsáveis.</p>;
  const d = await diaDaPessoa(pessoaId, dia);
  const pessoa = pessoas?.find((p) => p.id === pessoaId);
  const semana = new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
  const q = (dd: string) => `/admin/agenda?aba=dia&dia=${dd}${pessoas ? `&pessoa=${pessoaId}` : ""}`;
  const vazio = !d.compromissos.length && !d.deHoje.length && !d.atrasadas.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={q(somaDias(dia, -1))} className="icon-btn" aria-label="Dia anterior" data-tip="Dia anterior">
          <ChevronLeft aria-hidden />
        </Link>
        <h2 className="min-w-56 text-center text-sm font-semibold text-foreground first-letter:uppercase">
          {dia === hoje ? "Hoje, " : ""}
          {semana}
        </h2>
        <Link href={q(somaDias(dia, 1))} className="icon-btn" aria-label="Próximo dia" data-tip="Próximo dia">
          <ChevronRight aria-hidden />
        </Link>
        {dia !== hoje && (
          <Link href={q(hoje)} className="ml-1 text-xs font-medium text-navy-3 hover:underline">
            Hoje
          </Link>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {pessoas && <SeletorPessoa pessoas={pessoas} atual={pessoaId} dia={dia} />}
          {ehAdmin && dia === hoje && <EnviarRotinaAgora pessoaId={pessoaId} />}
        </div>
      </div>
      {pessoa && !pessoa.temZap && (
        <p className="text-xs text-muted">
          {pessoa.nome} não tem WhatsApp cadastrado: a rotina das 7h não chega.{" "}
          <Link href="/admin/team?aba=pessoas" className="ui-link">
            Cadastrar
          </Link>
        </p>
      )}

      {vazio && (
        <div className="ui-card flex items-center gap-3 p-5 text-sm text-muted">
          <Coffee className="h-5 w-5" aria-hidden /> Nada marcado para este dia.
        </div>
      )}

      {d.compromissos.length > 0 && (
        <section className="ui-card p-4">
          <h3 className="section-title flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[#7c5cc4]" aria-hidden /> Compromissos
          </h3>
          <ul className="mt-2 divide-y divide-border">
            {d.compromissos.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/agenda/compromisso/${c.id}`} className="flex items-center gap-3 px-1 py-2 text-sm hover:bg-surface-2">
                  <span className="w-24 shrink-0 text-xs font-medium text-foreground tabular-nums">
                    {c.hora}
                    {c.fim ? `–${c.fim}` : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {ROTULO_TIPO[c.tipo] ?? "Compromisso"}: {c.titulo}
                  </span>
                  {c.cliente && <span className="hidden max-w-48 truncate text-xs text-muted sm:inline">{c.cliente}</span>}
                  {c.local && <span className="hidden max-w-40 truncate text-xs text-muted md:inline">{c.local}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.deHoje.length > 0 && (
        <section className="ui-card p-4">
          <h3 className="section-title flex items-center gap-2">
            <Gavel className="h-4 w-4 text-status-pending" aria-hidden /> Vence {dia === hoje ? "hoje" : "neste dia"}
          </h3>
          <div className="mt-2">
            <ListaAtividades itens={d.deHoje} />
          </div>
        </section>
      )}

      {d.atrasadas.length > 0 && (
        <section className="ui-card border-status-danger/30 p-4">
          <h3 className="section-title flex items-center gap-2 text-status-danger">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Atrasadas ({d.atrasadas.length})
          </h3>
          <div className="mt-2">
            <ListaAtividades itens={d.atrasadas} mostrarData />
          </div>
        </section>
      )}

      {d.proximas.length > 0 && (
        <section className="ui-card p-4">
          <h3 className="section-title flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-muted" aria-hidden /> Próximos 3 dias
          </h3>
          <div className="mt-2">
            <ListaAtividades itens={d.proximas} mostrarData />
          </div>
        </section>
      )}
    </div>
  );
}
