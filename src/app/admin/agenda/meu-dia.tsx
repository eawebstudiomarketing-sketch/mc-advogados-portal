import Link from "next/link";
import { rotinaDoDia } from "@/lib/data/rotina-diaria";
import { MinhaRotina } from "@/components/rotina/minha-rotina";
import { ChevronLeft, ChevronRight, Coffee, MapPin } from "lucide-react";
import { diaDaPessoa, type AtividadeDoDia } from "@/lib/data/rotina";
import { Avatar } from "@/components/ui/avatar";

// O dia em linha do tempo: horário à esquerda, faixa de cor do tipo e quem
// está envolvido. Atrasadas e próximos dias ficam ao lado, curtos.

const COR: Record<string, { faixa: string; rotulo: string }> = {
  compromisso: { faixa: "bg-[#7c5cc4]", rotulo: "Compromisso" },
  audiencia: { faixa: "bg-gold", rotulo: "Audiência" },
  prazo: { faixa: "bg-status-danger", rotulo: "Prazo" },
  tarefa: { faixa: "bg-status-info", rotulo: "Tarefa" },
};
const somaDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

type Pessoa = { id: string; nome: string; foto: string | null };

function Pessoas({ ids, pessoas }: { ids: string[]; pessoas: Map<string, Pessoa> }) {
  const lista = ids.map((i) => pessoas.get(i)).filter((p): p is Pessoa => !!p);
  if (!lista.length) return null;
  return (
    <div className="flex shrink-0 -space-x-1.5">
      {lista.slice(0, 4).map((p) => (
        <Avatar key={p.id} nome={p.nome} foto={p.foto} tamanho={28} anel />
      ))}
    </div>
  );
}

function ListaCurta({ titulo, cor, itens, pessoas }: { titulo: string; cor: string; itens: AtividadeDoDia[]; pessoas: Map<string, Pessoa> }) {
  return (
    <section className="ui-card p-5">
      <p className="eyebrow flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${cor}`} aria-hidden /> {titulo}
        <span className="numero-grande ml-auto text-base !tracking-normal text-foreground">{itens.length}</span>
      </p>
      <ul className="mt-3 space-y-1">
        {itens.slice(0, 6).map((a) => (
          <li key={a.id}>
            <Link href={`/admin/activities/${a.id}`} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
              {a.responsavelId && pessoas.get(a.responsavelId) ? (
                <Avatar nome={pessoas.get(a.responsavelId)!.nome} foto={pessoas.get(a.responsavelId)!.foto} tamanho={24} />
              ) : (
                <span className="h-6 w-6 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{a.titulo}</span>
              <span className="eyebrow shrink-0">{a.prazo ? dataCurta(a.prazo) : ""}</span>
            </Link>
          </li>
        ))}
        {itens.length > 6 && <li className="px-2 pt-1 text-xs text-muted">e mais {itens.length - 6}</li>}
      </ul>
    </section>
  );
}

export async function MeuDia({
  pessoaId,
  dia,
  hoje,
  pessoas,
  hrefDia,
  meuId = null,
}: {
  /** responsável de quem está vendo: só ele marca a própria rotina */
  meuId?: string | null;
  /** null = o escritório inteiro */
  pessoaId: string | null;
  dia: string;
  hoje: string;
  pessoas: Pessoa[];
  hrefDia: (dia: string) => string;
}) {
  const [d, rotina] = await Promise.all([diaDaPessoa(pessoaId, dia), pessoaId && pessoaId !== "__ninguem__" ? rotinaDoDia(pessoaId, dia) : Promise.resolve([])]);
  const nomeDaPessoa = pessoaId ? pessoas.find((p) => p.id === pessoaId)?.nome : null;
  const mapa = new Map(pessoas.map((p) => [p.id, p]));
  const semana = new Date(`${dia}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });

  // tudo do dia numa linha do tempo só (sem hora = "Dia todo", no topo)
  const linhas = [
    ...d.compromissos.map((c) => ({
      chave: `c-${c.id}`,
      href: `/admin/agenda/compromisso/${c.id}`,
      hora: c.hora,
      fim: c.fim,
      titulo: c.titulo,
      cliente: c.cliente,
      local: c.local,
      tipo: "compromisso",
      pessoas: c.participantes,
    })),
    ...d.deHoje.map((a) => ({
      chave: `a-${a.id}`,
      href: `/admin/activities/${a.id}`,
      hora: a.hora ? a.hora.slice(0, 5) : null,
      fim: null,
      titulo: a.titulo,
      cliente: a.cliente,
      local: null,
      tipo: a.categoria,
      pessoas: a.responsavelId ? [a.responsavelId] : [],
    })),
  ].sort((x, y) => (x.hora ?? "").localeCompare(y.hora ?? ""));

  return (
    <div>
      <div className="mb-5 flex items-center gap-1">
        <Link href={hrefDia(somaDias(dia, -1))} className="icon-btn" aria-label="Dia anterior">
          <ChevronLeft aria-hidden />
        </Link>
        <Link href={hrefDia(somaDias(dia, 1))} className="icon-btn" aria-label="Próximo dia">
          <ChevronRight aria-hidden />
        </Link>
        <h2 className="font-display ml-2 text-xl font-bold tracking-tight text-foreground first-letter:uppercase">
          {dia === hoje ? "Hoje · " : ""}
          {semana}
        </h2>
        {dia !== hoje && (
          <Link href={hrefDia(hoje)} className="eyebrow ml-3 hover:!text-foreground">
            Voltar para hoje
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <section className="ui-card p-2 sm:p-3">
          {linhas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <Coffee className="h-6 w-6 text-muted" aria-hidden />
              <p className="font-display text-lg font-bold text-foreground">Dia livre.</p>
              <p className="text-sm text-muted">Nada marcado para {dia === hoje ? "hoje" : "este dia"}.</p>
            </div>
          ) : (
            <ol>
              {linhas.map((l) => (
                <li key={l.chave}>
                  <Link href={l.href} className="group flex items-stretch gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-surface-2">
                    <div className="w-14 shrink-0 pt-0.5 text-right">
                      <p className="numero-grande text-lg leading-none text-foreground">{l.hora ?? "—"}</p>
                      {l.fim ? <p className="eyebrow mt-1">até {l.fim}</p> : !l.hora ? <p className="eyebrow mt-1">dia todo</p> : null}
                    </div>
                    <span className={`w-1 shrink-0 rounded-full ${COR[l.tipo]?.faixa ?? COR.tarefa.faixa}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">{COR[l.tipo]?.rotulo ?? "Tarefa"}</p>
                      <p className="truncate text-[15px] font-semibold text-foreground">{l.titulo}</p>
                      <p className="flex items-center gap-2 truncate text-xs text-muted">
                        {l.cliente}
                        {l.local && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden /> {l.local}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center">
                      <Pessoas ids={l.pessoas} pessoas={mapa} />
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="space-y-4">
          {rotina.length > 0 && (
            <MinhaRotina
              key={`${pessoaId}-${dia}`}
              itens={rotina.map((i) => ({ id: i.id, titulo: i.titulo, feito: i.feito }))}
              podeMarcar={pessoaId === meuId && dia === hoje}
              titulo={pessoaId === meuId ? (dia === hoje ? "Minha rotina de hoje" : "Minha rotina do dia") : `Rotina de ${nomeDaPessoa?.split(" ")[0] ?? "pessoa"}`}
            />
          )}
          {d.atrasadas.length > 0 && <ListaCurta titulo="Atrasadas" cor="bg-status-danger" itens={d.atrasadas} pessoas={mapa} />}
          {d.proximas.length > 0 && <ListaCurta titulo="Próximos 3 dias" cor="bg-status-info" itens={d.proximas} pessoas={mapa} />}
          {!d.atrasadas.length && !d.proximas.length && (
            <section className="ui-card p-5 text-sm text-muted">Nada atrasado e nada para os próximos dias.</section>
          )}
        </div>
      </div>
    </div>
  );
}
