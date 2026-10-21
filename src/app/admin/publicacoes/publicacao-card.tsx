import Link from "next/link";
import { CalendarClock, ExternalLink, Gavel, RotateCcw, X, CheckCheck, FilePlus2 } from "lucide-react";
import { STATUS_PUBLICACAO, type Publicacao, type PublicacaoStatus } from "@/lib/data/publicacoes";
import { sugerir, dataPublicacao, type Sugestao } from "@/lib/publicacoes/sugestoes";
import { TextoAstrea } from "@/components/ui/texto-astrea";
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
  // mesmas colunas da tela Publicações do Astrea; publicação só do DJEN usa o equivalente
  const titulo = p.titulo_processo ?? (partes.length ? partes.map((x) => x.nome).join(" x ") : null);
  const responsavel = p.responsavel_nome ?? p.processes?.profiles?.full_name;
  const diario = p.diario ?? p.tribunal;
  const nomePesquisado = p.tribunal === "INPI" ? "INPI · procurador" : (p.nome_pesquisado ?? (p.termo ? `OAB ${p.termo}` : null));
  const texto = p.texto_html ?? p.texto;

  return (
    <article id={`pub-${p.id}`} className={`ui-card p-5 ${destaque ? "ring-2 ring-gold" : ""}`}>
      <div className="grid gap-x-5 gap-y-3 md:grid-cols-[auto_8.5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]">
        <div className="hidden md:block">
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
        </div>
        <div className="text-sm">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Divulgado em</p>
          <p className="font-medium text-foreground">{dataBR(p.data_disponibilizacao)}</p>
          <p className="mt-1 text-xs text-muted">Publicado em: {dataBR(p.data_publicacao ?? dataPublicacao(p.data_disponibilizacao))}</p>
        </div>
        <div className="min-w-0 text-sm">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Processo</p>
          <h3 className="font-semibold text-foreground">
            {p.processes ? (
              <Link href={`/admin/processes/${p.processes.id}`} className="text-navy hover:underline">
                {numero}
              </Link>
            ) : (
              numero
            )}
          </h3>
          {titulo && <p className="mt-0.5 text-[13px] break-words text-navy-3">{titulo}</p>}
          {responsavel && <p className="mt-0.5 text-xs text-muted">Responsável: <span className="font-medium text-foreground/80">{responsavel}</span></p>}
          <p className="mt-1 text-xs">
            {p.clients ? (
              <Link href={`/admin/clients/${p.clients.id}`} className="font-medium text-navy-3 hover:underline">
                {p.clients.name}
              </Link>
            ) : p.processes ? (
              <span className="text-status-pending">
                Processo sem cliente no portal ·{" "}
                <Link href={`/admin/processes/${p.processes.id}`} className="font-medium underline-offset-2 hover:underline">
                  Vincular cliente
                </Link>
              </span>
            ) : (
              <span className="text-status-pending">
                Processo não cadastrado no portal ·{" "}
                <Link href={`/admin/processes/new?numero=${encodeURIComponent(numero)}&publicacao=${p.id}`} className="font-medium underline-offset-2 hover:underline">
                  Cadastrar processo
                </Link>
              </span>
            )}
          </p>
        </div>
        <div className="min-w-0 text-sm">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Diário</p>
          <p className="font-medium text-foreground/90">
            {diario}
            {p.uf ? <span className="font-normal text-muted"> · {p.uf}</span> : null}
          </p>
          <p className="mt-0.5 text-xs break-words text-foreground/75">{p.orgao}</p>
          {p.tipo_comunicacao && <p className="mt-0.5 text-xs text-muted">{p.tipo_comunicacao}</p>}
        </div>
        <div className="min-w-0 text-sm">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">Nome pesquisado</p>
          <p className="break-words text-foreground/85">{nomePesquisado ?? "—"}</p>
        </div>
        <div className="flex items-start justify-between gap-2 md:flex-col md:items-end">
          {selecionavel && status === "nao_tratada" && (
            <input
              type="checkbox"
              name="ids"
              value={p.id}
              form="publicacoes-lote"
              aria-label={`Selecionar processo ${numero}`}
              className="mt-1 h-4 w-4 shrink-0 accent-navy md:hidden"
            />
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${COR_STATUS[status]}`}>{STATUS_PUBLICACAO[status]}</span>
        </div>
      </div>

      <details className="group mt-3" data-publicacao-texto>
        <summary className="cursor-pointer list-none text-sm text-foreground/80">
          <span className="line-clamp-2 group-open:hidden">
            <TextoAstrea texto={texto} corrido />
          </span>
          <span className="mt-1 inline-block text-xs font-medium text-navy-3 group-open:hidden">Ler mais</span>
          <span className="hidden text-xs font-medium text-navy-3 group-open:inline">Recolher</span>
        </summary>
        <p className="mt-2 max-h-[28rem] overflow-y-auto rounded-lg bg-surface-2 p-3 text-sm text-foreground/85">
          <TextoAstrea texto={texto} />
        </p>
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
