import Link from "next/link";
import { Archive, CheckCheck, FilePlus2, Gavel, RotateCcw, Star, X } from "lucide-react";
import type { GrupoAndamentos } from "@/lib/data/andamentos";
import { BAIXADO } from "@/lib/andamentos/padroes";
import { mudarSituacaoAndamentosAction } from "./actions";
import { EtiquetasAstrea, TextoAstrea } from "@/components/ui/texto-astrea";

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit", year: "numeric" });

const TIPO: Record<string, string> = { andamento: "Andamento", publicacao: "Publicação", tarefa: "Tarefa", compromisso: "Compromisso", nota: "Anotação" };

/** Link para a atividade já preenchida com os andamentos (ao salvar, eles ficam como tratados). */
function hrefTratar(g: GrupoAndamentos): string {
  const p = g.processo;
  const principal = g.andamentos.find((a) => a.importante) ?? g.andamentos[0];
  const titulo = `Andamento: ${principal.descricao.slice(0, 90)} — processo ${p.numero_processo}`;
  const descricao = [
    `${p.titulo ?? ""}`,
    `${p.vara_tribunal ?? ""}`,
    "",
    ...g.andamentos.slice(0, 15).map((a) => `${dataHora(a.data)} — ${a.descricao}`),
  ].join("\n");
  const q = new URLSearchParams({ andamentos: p.id, titulo, descricao: descricao.slice(0, 1800), tipo: "processo" });
  if (p.client_id) q.set("clientId", p.client_id);
  return `/admin/activities/new?${q}`;
}

function Botao({ g, situacao, rotulo, icone: Icone }: { g: GrupoAndamentos; situacao: "tratado" | "descartado" | "novo"; rotulo: string; icone: typeof X }) {
  return (
    <form action={mudarSituacaoAndamentosAction}>
      {g.andamentos.map((a) => (
        <input key={a.id} type="hidden" name="id" value={a.id} />
      ))}
      <input type="hidden" name="situacao" value={situacao} />
      <button type="submit" className="ui-btn-secondary px-3 py-1.5 text-xs">
        <Icone className="h-3.5 w-3.5" aria-hidden /> {rotulo}
      </button>
    </form>
  );
}

export function GrupoCard({ g, situacao }: { g: GrupoAndamentos; situacao: "novo" | "tratado" | "descartado" }) {
  const p = g.processo;
  const baixado = g.andamentos.some((a) => BAIXADO.test(a.descricao));
  const cliente = p.clients?.name ?? p.cliente_nome;
  return (
    <article className="ui-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Gavel className="h-3.5 w-3.5" aria-hidden />
            <span>Andamento recebido</span>
            <span>·</span>
            <span className="font-medium text-foreground/80">
              {g.andamentos.length} andamento{g.andamentos.length === 1 ? "" : "s"}
              {g.importantes > 0 && <span className="text-status-pending"> – {g.importantes} importante{g.importantes === 1 ? "" : "s"}</span>}
            </span>
            {baixado && <span className="rounded-full bg-status-danger-bg px-2 py-px text-[11px] font-semibold text-status-danger">possível arquivamento</span>}
          </p>
          <h2 className="mt-1.5 text-[15px] font-semibold text-foreground">{p.titulo ?? p.numero_processo}</h2>
          <p className="mt-0.5 text-xs text-muted">
            <Link href={`/admin/processes/${p.id}`} className="font-medium text-navy-3 hover:underline">
              {p.numero_processo}
            </Link>
            {p.vara_tribunal ? ` · ${p.vara_tribunal}` : ""}
            {cliente ? (
              <>
                {" · "}
                {p.client_id ? (
                  <Link href={`/admin/clients/${p.client_id}`} className="hover:underline">
                    {cliente}
                  </Link>
                ) : (
                  <span title="Cliente ainda não cadastrado no portal">{cliente} (sem ficha)</span>
                )}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {situacao === "novo" ? (
            <>
              <Link href={hrefTratar(g)} className="ui-btn px-3 py-1.5 text-xs">
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden /> Tratar
              </Link>
              <Botao g={g} situacao="tratado" rotulo="Já tratei" icone={CheckCheck} />
              <Botao g={g} situacao="descartado" rotulo="Descartar" icone={X} />
            </>
          ) : (
            <Botao g={g} situacao="novo" rotulo="Voltar para não tratados" icone={RotateCcw} />
          )}
          {baixado && (
            <Link href={`/admin/processes/${p.id}/edit`} className="ui-btn-secondary px-3 py-1.5 text-xs">
              <Archive className="h-3.5 w-3.5" aria-hidden /> Encerrar processo
            </Link>
          )}
        </div>
      </div>

      <ol className="mt-4 space-y-2.5 border-l-2 border-border pl-4">
        {g.andamentos.map((a) => (
          <li key={a.id} className="relative">
            <span className={`absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full ${a.importante ? "bg-gold" : "bg-border-strong"}`} aria-hidden />
            <p className="text-xs text-muted">
              {dataHora(a.data)} · {TIPO[a.tipo] ?? a.tipo}
              {a.importante && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 font-medium text-status-pending">
                  <Star className="h-3 w-3" aria-hidden /> importante
                </span>
              )}
              {a.responsavel_nome && <span> · Responsável: {a.responsavel_nome}</span>}
              {" "}
              <EtiquetasAstrea etiquetas={a.etiquetas} />
            </p>
            <p className="text-sm text-foreground/90">
              <TextoAstrea texto={a.descricao_html ?? a.descricao} />
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}
