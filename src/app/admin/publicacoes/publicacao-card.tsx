import Link from "next/link";
import { CalendarClock, ExternalLink, Gavel, RotateCcw, X, CheckCheck, FilePlus2 } from "lucide-react";
import { STATUS_PUBLICACAO, type Publicacao, type PublicacaoStatus } from "@/lib/data/publicacoes";
import { sugerir, type Sugestao } from "@/lib/publicacoes/sugestoes";
import { mudarStatusPublicacaoAction } from "./actions";

const dataBR = (iso: string) => iso.split("-").reverse().join("/");

const COR_STATUS: Record<PublicacaoStatus, string> = {
  nao_tratada: "text-status-pending bg-status-pending-bg",
  tratada: "text-status-success bg-status-success-bg",
  descartada: "text-muted bg-surface-2",
};

/** Link para o formulário de atividade já preenchido com a publicação. */
function hrefTratar(p: Publicacao, s?: Sugestao): string {
  const numero = p.numero_mascara ?? p.numero_processo;
  const titulo =
    s?.tipo === "audiencia"
      ? `Audiência${s.hora ? ` às ${s.hora}` : ""} — processo ${numero}`
      : `${s?.tipo === "prazo" ? `Prazo ${s.dias} dias` : "Publicação"}: ${(p.tipo_comunicacao ?? "intimação").toLowerCase()} — processo ${numero}`;
  const descricao = [
    `Publicação no DJEN de ${dataBR(p.data_disponibilizacao)} · ${p.tribunal ?? ""} · ${p.orgao ?? ""}`,
    p.link ? `Inteiro teor: ${p.link}` : "",
    "",
    (p.texto ?? "").slice(0, 1500),
  ]
    .filter((l, i) => l || i === 2)
    .join("\n");
  const q = new URLSearchParams({ publicacao: p.id, titulo, descricao, tipo: "processo" });
  if (p.client_id) q.set("clientId", p.client_id);
  if (s?.tipo === "prazo") q.set("prazo", s.vencimento);
  if (s?.tipo === "audiencia") q.set("prazo", s.data);
  return `/admin/activities/new?${q}`;
}

function BotaoStatus({ id, status, rotulo, icone: Icone }: { id: string; status: PublicacaoStatus; rotulo: string; icone: typeof X }) {
  return (
    <form action={mudarStatusPublicacaoAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className="ui-btn-secondary px-3 py-1.5 text-xs">
        <Icone className="h-3.5 w-3.5" aria-hidden /> {rotulo}
      </button>
    </form>
  );
}

export function PublicacaoCard({ p, destaque = false }: { p: Publicacao; destaque?: boolean }) {
  const status = p.status as PublicacaoStatus;
  const sugestoes = status === "nao_tratada" ? sugerir(p.texto ?? "", p.data_disponibilizacao) : [];
  const partes = (p.partes as { nome: string; polo: string }[] | null) ?? [];
  const numero = p.numero_mascara ?? p.numero_processo;

  return (
    <article id={`pub-${p.id}`} className={`ui-card p-5 ${destaque ? "ring-2 ring-gold" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            Disponibilizada em {dataBR(p.data_disponibilizacao)} · <span className="font-medium text-foreground/80">{p.tribunal}</span>
            {p.tipo_comunicacao ? ` · ${p.tipo_comunicacao}` : ""}
          </p>
          <h3 className="mt-1 text-[15px] font-semibold text-foreground">
            {p.processes ? (
              <Link href={`/admin/processes/${p.processes.id}`} className="text-navy hover:underline">
                Processo {numero}
              </Link>
            ) : (
              <>Processo {numero}</>
            )}
          </h3>
          <p className="mt-0.5 text-sm">
            {p.clients ? (
              <Link href={`/admin/clients/${p.clients.id}`} className="font-medium text-navy-3 hover:underline">
                {p.clients.name}
              </Link>
            ) : (
              <span className="text-status-pending">
                Processo não cadastrado no portal ·{" "}
                <Link href={`/admin/processes/new?numero=${encodeURIComponent(numero)}`} className="font-medium underline-offset-2 hover:underline">
                  Cadastrar processo
                </Link>
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            {[p.orgao, p.classe].filter(Boolean).join(" · ")}
            {partes.length > 0 && <> · {partes.map((x) => x.nome).join(", ")}</>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COR_STATUS[status]}`}>{STATUS_PUBLICACAO[status]}</span>
          <span className="text-[11px] text-muted">OAB {p.termo}</span>
        </div>
      </div>

      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-sm text-foreground/80">
          <span className="line-clamp-3 whitespace-pre-line group-open:hidden">{p.texto}</span>
          <span className="mt-1 inline-block text-xs font-medium text-navy-3 group-open:hidden">Ler publicação inteira</span>
          <span className="hidden text-xs font-medium text-navy-3 group-open:inline">Recolher</span>
        </summary>
        <p className="mt-2 max-h-[28rem] overflow-y-auto rounded-lg bg-surface-2 p-3 text-sm whitespace-pre-line text-foreground/85">{p.texto}</p>
      </details>

      {sugestoes.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Sugestões:</span>
          {sugestoes.map((s) => (
            <Link key={s.rotulo} href={hrefTratar(p, s)} className="inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/10 px-3 py-1 text-xs font-medium text-navy hover:bg-gold/20">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden /> {s.tipo === "prazo" ? "Adicionar prazo" : "Adicionar audiência"}: {s.rotulo}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {status === "nao_tratada" ? (
          <>
            <Link href={hrefTratar(p)} className="ui-btn px-3 py-1.5 text-xs">
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden /> Tratar (criar atividade)
            </Link>
            <BotaoStatus id={p.id} status="tratada" rotulo="Já tratei" icone={CheckCheck} />
            <BotaoStatus id={p.id} status="descartada" rotulo="Descartar" icone={X} />
          </>
        ) : (
          <>
            {p.activity_id && (
              <Link href={`/admin/activities/${p.activity_id}`} className="ui-btn-secondary px-3 py-1.5 text-xs">
                <Gavel className="h-3.5 w-3.5" aria-hidden /> Ver atividade
              </Link>
            )}
            <BotaoStatus id={p.id} status="nao_tratada" rotulo="Reabrir" icone={RotateCcw} />
          </>
        )}
        {p.link && (
          <a href={p.link} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-navy-3 hover:underline">
            Inteiro teor no tribunal <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}
