import Link from "next/link";
import { CalendarClock, ExternalLink, Gavel, RotateCcw, X, CheckCheck, FilePlus2 } from "lucide-react";
import { STATUS_PUBLICACAO, type Publicacao, type PublicacaoStatus } from "@/lib/data/publicacoes";
import { sugerir, dataPublicacao, type Sugestao } from "@/lib/publicacoes/sugestoes";
import { mudarStatusPublicacaoAction } from "./actions";

const dataBR = (iso: string) => iso.split("-").reverse().join("/");

const COR_STATUS: Record<PublicacaoStatus, string> = {
  nao_tratada: "text-status-pending bg-status-pending-bg",
  tratada: "text-status-success bg-status-success-bg",
  descartada: "text-muted bg-surface-2",
};

/** Link para o formulário de atividade já preenchido com a publicação. */
function hrefTratar(p: Publicacao, s?: Sugestao): string {
  const inpi = p.tribunal === "INPI";
  const numero = `${inpi ? "INPI " : "processo "}${p.numero_mascara ?? p.numero_processo}`;
  const titulo =
    s?.tipo === "audiencia"
      ? `Audiência${s.hora ? ` às ${s.hora}` : ""} — ${numero}`
      : s?.tipo === "prazo"
        ? `Prazo ${s.dias} dias: ${s.acao ?? (p.tipo_comunicacao ?? "intimação").toLowerCase()} — ${numero}`
        : `Publicação: ${(p.tipo_comunicacao ?? "intimação").toLowerCase()} — ${numero}`;
  const descricao = [
    `Publicação ${inpi ? "na RPI" : "no DJEN"} de ${dataBR(p.data_disponibilizacao)} · ${p.tribunal ?? ""} · ${p.orgao ?? ""}`,
    p.link ? `Inteiro teor: ${p.link}` : "",
    "",
    (p.texto ?? "").slice(0, 1500),
  ]
    .filter((l, i) => l || i === 2)
    .join("\n");
  const q = new URLSearchParams({ publicacao: p.id, titulo, descricao, tipo: "processo" });
  if (p.client_id) q.set("clientId", p.client_id);
  if (s?.tipo === "prazo") {
    q.set("prazo", s.vencimento);
    q.set("categoria", "prazo");
    q.set("sugestao", "prazo");
  }
  if (s?.tipo === "audiencia") {
    q.set("prazo", s.data);
    q.set("categoria", "audiencia");
    q.set("sugestao", "audiencia");
    if (s.hora) q.set("hora", s.hora);
  }
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

export type TaxaSugestoes = Partial<Record<"prazo" | "audiencia", number>>;

export function PublicacaoCard({
  p,
  destaque = false,
  selecionavel = false,
  taxas = {},
}: {
  p: Publicacao;
  destaque?: boolean;
  selecionavel?: boolean;
  /** % de vezes que cada tipo de sugestão foi usado (só aparece com histórico suficiente). */
  taxas?: TaxaSugestoes;
}) {
  const status = p.status as PublicacaoStatus;
  const sugestoes =
    status === "nao_tratada"
      ? sugerir(p.texto ?? "", p.data_disponibilizacao, { tribunal: p.tribunal, codigos: (p.tipo_documento ?? "").split(/,\s*/) })
      : [];
  const partes = (p.partes as { nome: string; polo: string }[] | null) ?? [];
  const numero = p.numero_mascara ?? p.numero_processo;
  const responsavel = p.processes?.profiles?.full_name;

  return (
    <article id={`pub-${p.id}`} className={`ui-card p-5 ${destaque ? "ring-2 ring-gold" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {selecionavel && status === "nao_tratada" && (
            <input
              type="checkbox"
              name="ids"
              value={p.id}
              form="publicacoes-lote"
              aria-label={`Selecionar processo ${numero}`}
              className="mt-1 h-4 w-4 shrink-0 accent-navy"
            />
          )}
        <div className="min-w-0">
          <p className="text-xs text-muted">
            Divulgada em {dataBR(p.data_disponibilizacao)} · Publicada em {dataBR(dataPublicacao(p.data_disponibilizacao))} ·{" "}
            <span className="font-medium text-foreground/80">{p.tribunal}</span>
            {p.uf ? ` · ${p.uf}` : ""}
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
                <Link href={`/admin/processes/new?numero=${encodeURIComponent(numero)}&publicacao=${p.id}`} className="font-medium underline-offset-2 hover:underline">
                  Cadastrar processo
                </Link>
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted">
            {[p.orgao, p.classe].filter(Boolean).join(" · ")}
            {partes.length > 0 && <> · {partes.map((x) => x.nome).join(", ")}</>}
          </p>
          {responsavel && <p className="mt-0.5 text-xs text-muted">Responsável: <span className="font-medium text-foreground/80">{responsavel}</span></p>}
        </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COR_STATUS[status]}`}>{STATUS_PUBLICACAO[status]}</span>
          <span className="text-[11px] text-muted">{p.tribunal === "INPI" ? "INPI · procurador" : `OAB ${p.termo}`}</span>
        </div>
      </div>

      <details className="group mt-3" data-publicacao-texto>
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
              {taxas[s.tipo] !== undefined && <span className="font-normal text-muted">· usada em {taxas[s.tipo]}% das vezes</span>}
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
            {p.tribunal === "INPI" ? "Revista no INPI" : "Inteiro teor no tribunal"} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}
