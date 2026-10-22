import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, MoreVertical, ThumbsDown } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { EtiquetasAstrea, TextoAstrea } from "@/components/ui/texto-astrea";
import { getPublicacao, STATUS_PUBLICACAO, type PublicacaoStatus } from "@/lib/data/publicacoes";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { atividadesPendentesDoProcesso, processoDoAlerta } from "@/lib/data/alertas";
import { dataPublicacao, sugerir, type Sugestao } from "@/lib/publicacoes/sugestoes";
import { desvincularProcessoAction, situacaoPublicacaoAction, sugestaoIncorretaAction } from "../../actions";
import { EtiquetasBotao, Imprimir, MenuTratar } from "../../ferramentas";
import { QuadroProcesso } from "../../quadro-processo";

// Tela "Publicação" do Astrea: texto do diário à esquerda; à direita o quadro do
// processo e os "Tratamentos sugeridos". Topo: Tratamentos ▾, Descartar, Concluir.

const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

const COR: Record<PublicacaoStatus, string> = {
  nao_tratada: "bg-status-pending-bg text-status-pending",
  tratada: "bg-status-success-bg text-status-success",
  descartada: "bg-surface-2 text-muted",
};

export default async function TratarPublicacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("publicacoes");
  const { id } = await params;
  const p = await getPublicacao(id);
  if (!p) notFound();
  const processo = p.process_id ? await processoDoAlerta(p.process_id) : null;
  const [etiquetas, pendentes] = await Promise.all([listEtiquetas(), processo ? atividadesPendentesDoProcesso(processo) : Promise.resolve([])]);
  const status = p.status as PublicacaoStatus;
  const numero = p.numero_mascara ?? p.numero_processo;
  const texto = p.texto_html ?? p.texto;
  const bruto = (p.bruto ?? {}) as { classificationReliabilityRate?: number; classificationTypes?: string[]; division?: string; court?: string };

  // tratamentos sugeridos: a % do Astrea quando houver; senão, a leitura do próprio portal
  const sugestoes: Sugestao[] = p.sugestao_incorreta ? [] : sugerir(p.texto ?? "", p.data_disponibilizacao, { tribunal: p.tribunal, codigos: (p.tipo_documento ?? "").split(/,\s*/) });
  const pctAstrea = bruto.classificationTypes?.includes("DEADLINE") ? Math.round(bruto.classificationReliabilityRate ?? 0) : null;
  const temSugestao = !p.sugestao_incorreta && (pctAstrea !== null || sugestoes.length > 0);

  const base = {
    publicacao: p.id,
    tipo: "processo",
    titulo: `Publicação: ${(p.tipo_comunicacao ?? "intimação").toLowerCase()} — processo ${numero}`,
    descricao: [`Publicação de ${dataBR(p.data_disponibilizacao)} · ${p.diario ?? p.tribunal ?? ""} · ${p.orgao ?? ""}`, p.link ? `Inteiro teor: ${p.link}` : "", "", (p.texto ?? "").slice(0, 1500)].join("\n"),
    ...(p.client_id ? { clientId: p.client_id } : {}),
  };
  const hrefTarefa = `/admin/activities/new?${new URLSearchParams(base)}`;
  const prazo = sugestoes.find((s) => s.tipo === "prazo");
  const hrefPrazo = `/admin/activities/new?${new URLSearchParams({
    ...base,
    titulo: prazo?.tipo === "prazo" ? `Prazo ${prazo.dias} dias: ${prazo.acao ?? (p.tipo_comunicacao ?? "intimação").toLowerCase()} — processo ${numero}` : `Prazo — processo ${numero}`,
    categoria: "prazo",
    sugestao: "prazo",
    ...(prazo?.tipo === "prazo" ? { prazo: prazo.vencimento } : {}),
  })}`;
  const qe = new URLSearchParams({ titulo: `Processo ${numero}`, descricao: base.descricao.slice(0, 1800), publicacao: p.id, voltar: `/admin/alertas/publicacao/${p.id}` });
  if (p.client_id) qe.set("clientId", p.client_id);

  const linkTopo = "text-[13px] font-semibold tracking-wide text-navy-3 uppercase hover:underline";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">Publicação</h1>
            <EtiquetasBotao publicacaoId={p.id} todas={etiquetas.map((e) => ({ nome: e.nome, cor: e.cor }))} atuais={((p.etiquetas as { label: string }[] | null) ?? []).map((e) => e.label)} grande />
            <Imprimir />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-px text-[10px] font-bold tracking-wide uppercase ${COR[status]}`}>{STATUS_PUBLICACAO[status]}</span>
            <EtiquetasAstrea etiquetas={p.etiquetas} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/admin/alertas" className={linkTopo}>
            Voltar
          </Link>
          <MenuTratar rotulo="Tratamentos" variante="botao" hrefTarefa={hrefTarefa} hrefEvento={`/admin/agenda/compromisso/novo?${qe}`} processId={p.process_id} publicacaoId={p.id} clientId={p.client_id} />
          {status === "nao_tratada" ? (
            <>
              <form action={situacaoPublicacaoAction}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="status" value="descartada" />
                <input type="hidden" name="voltar" value="alertas" />
                <button type="submit" className="ui-btn-secondary border-status-danger text-status-danger uppercase">
                  Descartar
                </button>
              </form>
              <form action={situacaoPublicacaoAction}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="status" value="tratada" />
                <input type="hidden" name="voltar" value="alertas" />
                <button type="submit" className="ui-btn-secondary uppercase">
                  Concluir
                </button>
              </form>
            </>
          ) : (
            <form action={situacaoPublicacaoAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="status" value="nao_tratada" />
              <button type="submit" className="ui-btn-secondary uppercase">
                Reabrir
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <article className="ui-card px-6 py-6 text-sm leading-relaxed text-foreground">
          <p className="font-semibold">Diário: {p.diario ?? p.tribunal}</p>
          <p className="mt-3">
            Vara: {p.orgao ?? bruto.division ?? "—"}
            {bruto.court ? ` - Comarca: ${bruto.court}` : ""}
          </p>
          <p className="mt-3">
            Divulgado em: <strong>{dataBR(p.data_disponibilizacao)}</strong> - Publicado em: <strong>{dataBR(p.data_publicacao ?? dataPublicacao(p.data_disponibilizacao))}</strong>
          </p>
          <p className="mt-3">Processo: {numero}</p>
          <p className="mt-3">
            Termo encontrado: <strong>{p.nome_pesquisado ?? (p.termo ? `OAB ${p.termo}` : "—")}</strong>
          </p>
          {p.link && (
            <p className="mt-3">
              Inteiro teor:{" "}
              <a href={p.link} target="_blank" rel="noreferrer" className="break-all text-navy-3 hover:underline">
                {p.link}
              </a>
            </p>
          )}
          <hr className="my-5 border-border" />
          <TextoAstrea texto={texto} className="text-justify" />
        </article>

        <div className="space-y-5 print:hidden">
          {processo ? (
            <QuadroProcesso
              processo={processo}
              cliente={processo.clients?.name ?? processo.cliente_nome}
              pendentes={pendentes}
              menu={
                <details className="relative">
                  <summary className="icon-btn cursor-pointer list-none" aria-label="Mais opções">
                    <MoreVertical aria-hidden />
                  </summary>
                  <form action={desvincularProcessoAction} className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-border bg-surface py-1 shadow-lg">
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="block w-full px-4 py-2.5 text-left text-sm hover:bg-surface-2">
                      Desvincular processo
                    </button>
                  </form>
                </details>
              }
            />
          ) : (
            <section className="ui-card px-5 py-4">
              <p className="text-xs font-semibold tracking-wide text-foreground uppercase">Processo</p>
              <p className="mt-3 text-sm text-muted">Processo não encontrado no portal.</p>
              <Link href={`/admin/processes/new?numero=${encodeURIComponent(numero)}&publicacao=${p.id}`} className="mt-3 inline-block text-[12px] font-semibold tracking-wide text-navy-3 uppercase hover:underline">
                Cadastrar processo
              </Link>
            </section>
          )}

          {status === "nao_tratada" && temSugestao && (
            <section>
              <p className="mb-2 text-xs font-semibold tracking-wide text-foreground uppercase">Tratamentos sugeridos</p>
              <div className="ui-card space-y-3 px-5 py-4">
                <p className="text-sm text-foreground">
                  {pctAstrea !== null ? `Esta publicação tem ${pctAstrea}% de chances de conter um prazo.` : "Esta publicação parece conter um prazo."}
                  {prazo?.tipo === "prazo" && <span className="text-muted"> Sugestão: {prazo.rotulo}.</span>}
                </p>
                <Link href={hrefPrazo} className="ui-btn-secondary flex w-full justify-center uppercase">
                  <CalendarClock className="h-4 w-4" aria-hidden /> Adicionar prazo
                </Link>
                {sugestoes
                  .filter((s) => s.tipo === "audiencia")
                  .map((s) => (
                    <Link
                      key={s.rotulo}
                      href={`/admin/activities/new?${new URLSearchParams({ ...base, titulo: `Audiência — processo ${numero}`, categoria: "audiencia", sugestao: "audiencia", ...(s.tipo === "audiencia" ? { prazo: s.data, ...(s.hora ? { hora: s.hora } : {}) } : {}) })}`}
                      className="ui-btn-secondary flex w-full justify-center uppercase"
                    >
                      <CalendarClock className="h-4 w-4" aria-hidden /> Adicionar audiência: {s.rotulo}
                    </Link>
                  ))}
                <form action={sugestaoIncorretaAction} className="flex justify-center">
                  <input type="hidden" name="id" value={p.id} />
                  <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-surface-2 px-4 py-2 text-[12px] font-semibold tracking-wide text-foreground/75 uppercase hover:text-foreground">
                    <ThumbsDown className="h-4 w-4" aria-hidden /> Classificar sugestão como incorreta
                  </button>
                </form>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
