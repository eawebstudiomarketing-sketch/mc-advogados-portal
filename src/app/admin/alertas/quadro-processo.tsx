import Link from "next/link";
import type { ProcessoAlerta } from "@/lib/data/alertas";

// Quadro "PROCESSO" ao lado das telas de tratar (como no Astrea), com
// "Ver atividades pendentes" e "Ver histórico".

const dataBR = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "sem prazo");

export function QuadroProcesso({
  processo,
  cliente,
  pendentes,
  menu,
}: {
  processo: ProcessoAlerta;
  cliente: string | null;
  pendentes: { id: string; title: string; deadline: string | null }[];
  /** ⋮ do quadro (ex.: "Desvincular processo" na publicação) */
  menu?: React.ReactNode;
}) {
  return (
    <section className="ui-card px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide text-foreground uppercase">Processo</p>
        {menu}
      </div>
      <Link href={`/admin/processes/${processo.id}`} className="mt-2 block text-[15px] text-navy-3 hover:underline">
        {processo.titulo ?? processo.numero_processo}
      </Link>
      <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
        <div>
          <dt className="inline text-muted">Processo: </dt>
          <dd className="inline text-foreground">{processo.numero_processo}</dd>
        </div>
        {cliente && (
          <div>
            <dt className="inline text-muted">Cliente: </dt>
            <dd className="inline text-foreground">
              {processo.client_id ? (
                <Link href={`/admin/clients/${processo.client_id}`} className="hover:underline">
                  {cliente}
                </Link>
              ) : (
                <>{cliente} <span className="text-muted">(sem ficha no portal)</span></>
              )}
            </dd>
          </div>
        )}
        <div>
          <dt className="inline text-muted">Status: </dt>
          <dd className="inline text-foreground">
            {processo.status === "ativo" ? "Ativo" : processo.status.charAt(0).toUpperCase() + processo.status.slice(1)}
            {processo.instancia ? ` | ${processo.instancia}º Grau` : ""}
          </dd>
        </div>
        {processo.responsavel_nome && (
          <div>
            <dt className="inline text-muted">Responsável: </dt>
            <dd className="inline text-foreground">{processo.responsavel_nome}</dd>
          </div>
        )}
        {processo.classe && (
          <div>
            <dt className="inline text-muted">Ação: </dt>
            <dd className="inline text-foreground">{processo.classe}</dd>
          </div>
        )}
      </dl>
      <p className="mt-4 border-t border-border pt-4 text-sm text-foreground/80">
        {processo.numero_processo}
        {processo.vara_tribunal && <span className="block">{processo.vara_tribunal}</span>}
      </p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[12px] font-semibold tracking-wide text-navy-3 uppercase hover:underline">
            Ver atividades pendentes
            <span className="rounded bg-navy-3 px-1.5 text-[11px] text-white">{pendentes.length}</span>
          </summary>
          <ul className="mt-2 space-y-1 text-sm">
            {pendentes.length === 0 && <li className="text-muted">Nenhuma atividade pendente.</li>}
            {pendentes.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/activities/${t.id}`} className="hover:underline">
                  {t.title}
                </Link>{" "}
                <span className="text-xs text-muted">· {dataBR(t.deadline)}</span>
              </li>
            ))}
          </ul>
        </details>
        <Link href={`/admin/processes/${processo.id}#andamentos`} className="text-[12px] font-semibold tracking-wide text-navy-3 uppercase hover:underline">
          Ver histórico
        </Link>
      </div>
    </section>
  );
}
