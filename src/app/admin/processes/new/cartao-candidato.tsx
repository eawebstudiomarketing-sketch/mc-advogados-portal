"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, RotateCw, X } from "lucide-react";
import type { Candidato } from "@/lib/processos-busca/candidatos";
import { PROCESS_AREA_LABEL, PROCESS_AREAS } from "@/lib/process-area";
import { CopiarNumero } from "@/components/ui/copiar-numero";
import { aprovarAction, descartarAction, lerDeNovoAction } from "./actions";

const dataBR = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
};
const horaBR = (iso: string) => {
  const d = new Date(/T\d{2}:\d{2}/.test(iso) ? (iso.length <= 16 ? `${iso}:00-03:00` : iso) : `${iso.slice(0, 10)}T12:00:00-03:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
  return /T\d{2}:\d{2}/.test(iso) ? `${dia} ${d.toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" })}` : dia;
};

/** Prévia de um processo pesquisado, para conferir e aprovar. */
export function CartaoCandidato({
  c,
  clients,
  aberto = false,
  clienteInicial,
  onMudou,
}: {
  c: Candidato;
  clients: { id: string; name: string }[];
  /** Começa com os andamentos à mostra (pesquisa pelo número). */
  aberto?: boolean;
  clienteInicial?: string;
  onMudou?: () => void;
}) {
  const [pending, start] = useTransition();
  const [clientId, setClientId] = useState(clienteInicial ?? "");
  const [area, setArea] = useState("");
  const [todos, setTodos] = useState(false);
  const [verAndamentos, setVerAndamentos] = useState(aberto);
  const [aprovado, setAprovado] = useState<string | null>(c.process_id);

  const r = c.resumo ?? ({} as Candidato["resumo"]);
  const movs = [...(c.leitura?.movs ?? [])].sort((a, b) => b.data.localeCompare(a.data));
  const mostrar = todos ? movs : movs.slice(0, 8);
  const grupos: [string, typeof r.partes][] = [
    ["Polo ativo", (r.partes ?? []).filter((p) => p.polo === "Ativo")],
    ["Polo passivo", (r.partes ?? []).filter((p) => p.polo === "Passivo")],
    ["Outros", (r.partes ?? []).filter((p) => p.polo !== "Ativo" && p.polo !== "Passivo")],
  ];

  const dados: [string, string | null][] = [
    ["Tribunal", [r.tribunal, r.grau].filter(Boolean).join(" · ") || null],
    ["Órgão julgador", r.orgao],
    ["Classe", r.classe],
    ["Assunto", (r.assuntos ?? []).join(", ") || null],
    ["Distribuído em", dataBR(r.ajuizamento)],
    ["Sistema", r.sistema],
    ["Segredo de justiça", r.sigilo ? "Sim" : r.sigilo === 0 ? "Não" : null],
    ["Último andamento", movs[0] ? `${horaBR(movs[0].data)} · ${movs[0].texto.slice(0, 90)}` : null],
    ["Última publicação", r.ultimaPublicacao ? `${dataBR(r.ultimaPublicacao)}${r.ultimaPublicacaoTipo ? ` · ${r.ultimaPublicacaoTipo}` : ""}` : null],
  ];

  const aprovar = () =>
    start(async () => {
      const res = await aprovarAction(c.id, { clientId: clientId || null, area: area || null });
      if (res.erro) return void toast.error(res.erro);
      setAprovado(res.processId ?? null);
      toast.success(
        res.lendo
          ? "Processo incluído. O robô ainda está lendo no tribunal: o histórico entra sozinho em seguida."
          : `Processo incluído com ${res.andamentos ?? 0} andamento(s) no histórico. A partir de agora ele é lido de 3 em 3 horas.`
      );
      onMudou?.();
    });
  const descartar = () =>
    start(async () => {
      if (!confirm(`Descartar o processo ${c.numero_processo}? Ele não entra no portal.`)) return;
      const res = await descartarAction(c.id);
      if (res.erro) return void toast.error(res.erro);
      toast.success("Descartado.");
      onMudou?.();
    });
  const relar = () =>
    start(async () => {
      const res = await lerDeNovoAction(c.id);
      if (res.erro) return void toast.error(res.erro);
      toast.success("Pedido ao robô: lendo de novo no tribunal.");
      onMudou?.();
    });

  return (
    <article className="ui-card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <CopiarNumero numero={c.numero_processo} className="text-base" />
          <p className="mt-1 text-sm text-muted">
            {[r.classe, r.orgao].filter(Boolean).join(" · ") || "Dados ainda não encontrados nas fontes públicas"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {c.origem === "djen" && <span className="rounded-md bg-gold/15 px-2 py-0.5 font-medium text-navy">Achado no diário oficial</span>}
          {c.status === "lendo" && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-muted">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Lendo no tribunal…
            </span>
          )}
          {c.status === "pronto" && <span className="rounded-md bg-status-success/15 px-2 py-0.5 font-medium text-status-success">Lido no tribunal · {movs.length} andamento(s)</span>}
          {c.status === "erro" && <span className="rounded-md bg-status-danger/15 px-2 py-0.5 font-medium text-status-danger">Não deu para ler no tribunal</span>}
        </div>
      </header>

      <div className="grid gap-5 px-5 py-4 lg:grid-cols-2">
        <dl className="space-y-1.5 text-sm">
          {dados.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex gap-3">
              <dt className="w-36 shrink-0 text-muted">{rotulo}</dt>
              <dd className="min-w-0 text-foreground">{valor ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <div className="space-y-3 text-sm">
          {grupos
            .filter(([rotulo, lista]) => rotulo !== "Outros" || lista.length > 0)
            .map(([rotulo, lista]) => (
              <div key={rotulo}>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">{rotulo}</p>
                <ul className="mt-1 space-y-0.5">
                  {lista.map((p) => (
                    <li key={p.nome} className="text-foreground">
                      {p.nome}
                      {rotulo === "Outros" && p.polo ? <span className="text-xs text-muted"> · {p.polo}</span> : null}
                    </li>
                  ))}
                  {lista.length === 0 && <li className="text-muted">—</li>}
                </ul>
              </div>
            ))}
          {(r.advogados ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Advogados</p>
              <ul className="mt-1 space-y-0.5">
                {r.advogados.map((a) => (
                  <li key={a.nome} className="text-foreground">
                    {a.nome} {a.oab && <span className="text-xs text-muted">· OAB {a.oab}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(r.partes ?? []).length === 0 && <p className="text-xs text-muted">As partes aparecem quando o processo tem publicação no diário oficial.</p>}
        </div>
      </div>

      {c.status === "erro" && (
        <p className="mx-5 mb-4 rounded-lg bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
          {c.leitura?.erro ?? "O tribunal não respondeu."} Você pode aprovar assim mesmo (os andamentos chegam na próxima leitura) ou pedir para ler de novo.
        </p>
      )}

      <div className="border-t border-border px-5 py-3">
        <button type="button" onClick={() => setVerAndamentos((v) => !v)} className="text-sm font-medium text-navy-3 hover:underline" disabled={c.status === "lendo" && !movs.length}>
          {c.status === "lendo" && !movs.length ? "Andamentos: o robô está lendo no tribunal (de 5 s a 1 min)…" : `${verAndamentos ? "Esconder" : "Ver"} andamentos (${movs.length})`}
        </button>
        {verAndamentos && movs.length > 0 && (
          <ol className="mt-3 divide-y divide-border text-sm">
            {mostrar.map((m, i) => (
              <li key={`${m.data}-${i}`} className="flex gap-4 py-2">
                <span className="w-32 shrink-0 text-xs text-muted tabular-nums">{horaBR(m.data)}</span>
                <span className="min-w-0 whitespace-pre-line text-foreground">{m.texto}</span>
              </li>
            ))}
            {movs.length > 8 && (
              <li className="py-2">
                <button type="button" onClick={() => setTodos((v) => !v)} className="text-xs font-medium text-navy-3 hover:underline">
                  {todos ? "Mostrar só os 8 mais recentes" : `Mostrar todos os ${movs.length}`}
                </button>
              </li>
            )}
          </ol>
        )}
      </div>

      <footer className="flex flex-wrap items-end gap-3 border-t border-border bg-surface-2/50 px-5 py-4">
        {aprovado ? (
          <p className="flex items-center gap-2 text-sm text-status-success">
            <Check className="size-4" aria-hidden /> Incluído no portal.
            <Link href={`/admin/processes/${aprovado}`} className="ui-link">
              Abrir o processo
            </Link>
          </p>
        ) : (
          <>
            <label className="min-w-52 flex-1">
              <span className="ui-label">Cliente (opcional)</span>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="ui-input">
                <option value="">Ligar depois</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-44">
              <span className="ui-label">Área</span>
              <select value={area} onChange={(e) => setArea(e.target.value)} className="ui-input">
                <option value="">Automática</option>
                {PROCESS_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {PROCESS_AREA_LABEL[a]}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={aprovar} disabled={pending} className="ui-btn inline-flex items-center gap-1.5">
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Aprovar
              </button>
              <button type="button" onClick={descartar} disabled={pending} className="ui-btn-secondary inline-flex items-center gap-1.5">
                <X className="size-4" aria-hidden /> Descartar
              </button>
              {(c.status === "erro" || c.status === "pronto") && (
                <button type="button" onClick={relar} disabled={pending} className="ui-btn-secondary inline-flex items-center gap-1.5" title="Pedir ao robô para ler de novo no tribunal">
                  <RotateCw className="size-4" aria-hidden /> Ler de novo
                </button>
              )}
              {r.link && (
                <a href={r.link} target="_blank" rel="noreferrer" className="ui-btn-secondary inline-flex items-center gap-1.5">
                  <ExternalLink className="size-4" aria-hidden /> Tribunal
                </a>
              )}
            </div>
          </>
        )}
      </footer>
    </article>
  );
}
