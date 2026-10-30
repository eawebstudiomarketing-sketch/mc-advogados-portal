"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Hash, IdCard, Loader2, Scale, Search, UserRound } from "lucide-react";
import type { Candidato } from "@/lib/processos-busca/candidatos";
import { CartaoCandidato } from "./cartao-candidato";
import { aprovarVariosAction, conferirVariosAction, pesquisarAction, type Achado, type ResultadoBusca, type TipoBusca } from "./actions";

const TIPOS: { id: TipoBusca; rotulo: string; icone: typeof Hash; dica: string }[] = [
  { id: "numero", rotulo: "Número do processo", icone: Hash, dica: "0000000-00.0000.0.00.0000" },
  { id: "nome", rotulo: "Nome da parte", icone: UserRound, dica: "Nome completo da pessoa ou da empresa" },
  { id: "documento", rotulo: "CPF/CNPJ", icone: IdCard, dica: "Somente números ou com pontuação" },
  { id: "oab", rotulo: "OAB", icone: Scale, dica: "Número da OAB" },
];

const dataBR = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export function NovoProcesso({
  candidatos,
  clients,
  oabs,
  numeroInicial,
  clienteInicial,
}: {
  candidatos: Candidato[];
  clients: { id: string; name: string }[];
  /** OABs do escritório (monitor de publicações), para a busca por OAB. */
  oabs: { numero: string; uf: string }[];
  /** Vindo de uma publicação: pesquisa esse número ao abrir. */
  numeroInicial?: string;
  /** Veio da ficha de um cliente (ou o cliente bateu pelas partes da publicação): já vem escolhido. */
  clienteInicial?: string;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoBusca>("numero");
  const [termo, setTermo] = useState(numeroInicial ?? "");
  const [uf, setUf] = useState(oabs[0]?.uf ?? "BA");
  const [resultado, setResultado] = useState<ResultadoBusca | null>(null);
  const [destaqueId, setDestaqueId] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [filtroOrigem, setFiltroOrigem] = useState<"todos" | "busca" | "djen">("todos");
  const [buscando, startBusca] = useTransition();
  const [enviando, startEnvio] = useTransition();
  const disparou = useRef(false);

  // enquanto o robô lê um processo pedido há pouco, a tela pergunta de novo a cada 4 s
  // (só os dos últimos 15 min: se a VPS cair, a tela não fica perguntando para sempre)
  const [agora] = useState(() => Date.now());
  const lendo = candidatos.some((c) => c.status === "lendo" && agora - Date.parse(c.created_at) < 15 * 60_000);
  useEffect(() => {
    if (!lendo) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [lendo, router]);

  const pesquisar = (t = tipo, valor = termo) =>
    startBusca(async () => {
      setMarcados(new Set());
      const r = await pesquisarAction(t, valor, uf);
      setResultado(r);
      if ("erro" in r) return void toast.error(r.erro);
      if (r.tipo === "numero") {
        setDestaqueId(r.candidato?.id ?? null);
        router.refresh();
      }
    });

  useEffect(() => {
    if (numeroInicial && !disparou.current) {
      disparou.current = true;
      pesquisar("numero", numeroInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeroInicial]);

  // o cartão do número pesquisado vem da lista do servidor (atualiza sozinho enquanto o robô lê)
  const destaque = useMemo(() => {
    if (!destaqueId) return null;
    return candidatos.find((c) => c.id === destaqueId) ?? (resultado && "tipo" in resultado && resultado.tipo === "numero" ? resultado.candidato : null);
  }, [destaqueId, candidatos, resultado]);

  const pendentes = candidatos.filter((c) => c.id !== destaqueId && (filtroOrigem === "todos" || c.origem === filtroOrigem));
  const prontos = pendentes.filter((c) => c.status === "pronto");

  const conferir = () =>
    startEnvio(async () => {
      const r = await conferirVariosAction([...marcados]);
      if (r.erro) return void toast.error(r.erro);
      toast.success(`${r.abertos} processo(s) mandados para leitura no tribunal${r.jaNoPortal ? ` · ${r.jaNoPortal} já estavam no portal` : ""}. Confira e aprove em "Aguardando aprovação".`);
      if (r.falhas.length) toast.error(r.falhas.slice(0, 3).join(" | "));
      setMarcados(new Set());
      const atual = await pesquisarAction(tipo, termo, uf);
      setResultado(atual);
      router.refresh();
    });

  const aprovarTodos = () =>
    startEnvio(async () => {
      if (!confirm(`Aprovar os ${prontos.length} processo(s) já lidos no tribunal? Eles entram no portal sem cliente (você liga depois).`)) return;
      const r = await aprovarVariosAction(prontos.map((c) => c.id));
      toast.success(`${r.aprovados} processo(s) incluído(s).`);
      if (r.falhas.length) toast.error(r.falhas.slice(0, 3).join(" | "));
      router.refresh();
    });

  const lista = resultado && "tipo" in resultado && resultado.tipo === "lista" ? resultado : null;
  const marcaveis = lista?.itens.filter((i) => !i.processId && !i.candidatoId && i.digitos.length === 20) ?? [];

  return (
    <div className="space-y-8">
      <section className="ui-card p-5">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Pesquisar por">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tipo === t.id}
              onClick={() => {
                setTipo(t.id);
                setResultado(null);
                if (t.id === "oab" && !termo && oabs[0]) setTermo(oabs[0].numero);
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tipo === t.id ? "bg-navy text-navy-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
            >
              <t.icone className="size-4" aria-hidden /> {t.rotulo}
            </button>
          ))}
        </div>

        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            pesquisar();
          }}
        >
          <label className="min-w-64 flex-1">
            <span className="sr-only">{TIPOS.find((t) => t.id === tipo)?.rotulo}</span>
            <input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder={TIPOS.find((t) => t.id === tipo)?.dica} className="ui-input" autoFocus inputMode={tipo === "nome" ? "text" : "numeric"} />
          </label>
          {tipo === "oab" && (
            <label className="w-20">
              <span className="sr-only">UF</span>
              <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))} placeholder="UF" className="ui-input uppercase" />
            </label>
          )}
          <button type="submit" disabled={buscando} className="ui-btn inline-flex items-center gap-1.5">
            {buscando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} Pesquisar
          </button>
        </form>
        {tipo === "oab" && oabs.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            OABs do escritório:{" "}
            {oabs.map((o, i) => (
              <button
                key={`${o.numero}${o.uf}`}
                type="button"
                className="ui-link"
                onClick={() => {
                  setTermo(o.numero);
                  setUf(o.uf);
                }}
              >
                {o.numero}/{o.uf}
                {i < oabs.length - 1 ? ", " : ""}
              </button>
            ))}
          </p>
        )}
        {tipo !== "numero" && <p className="mt-2 text-xs text-muted">A lista vem do diário oficial (DJEN): aparecem os processos que tiveram publicação. Marque os que quer conferir e o robô lê cada um no tribunal.</p>}
        {tipo === "documento" && <p className="mt-1 text-xs text-muted">Os tribunais não deixam pesquisar por CPF/CNPJ de fora: o portal acha o nome pelo cadastro do cliente (ou pela Receita, no CNPJ) e pesquisa por ele.</p>}
        {buscando && tipo === "numero" && <p className="mt-3 text-sm text-muted">Procurando o processo no DataJud e no diário oficial… (até 40 s)</p>}
      </section>

      {resultado && "tipo" in resultado && resultado.tipo === "numero" && resultado.jaNoPortal && (
        <p className="ui-card px-5 py-4 text-sm">
          Esse processo já está no portal.{" "}
          <Link href={`/admin/processes/${resultado.jaNoPortal}`} className="ui-link">
            Abrir o processo
          </Link>
        </p>
      )}

      {destaque && <CartaoCandidato key={destaque.id} c={destaque} clients={clients} clienteInicial={clienteInicial} aberto onMudou={() => router.refresh()} />}

      {lista && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">
              {lista.itens.length} processo(s) encontrados · {lista.buscouPor}
            </h2>
            {marcaveis.length > 0 && (
              <div className="flex items-center gap-2">
                <button type="button" className="ui-btn-secondary text-xs" onClick={() => setMarcados(new Set(marcados.size === marcaveis.length ? [] : marcaveis.map((i) => i.numero)))}>
                  {marcados.size === marcaveis.length ? "Desmarcar todos" : "Marcar todos"}
                </button>
                <button type="button" className="ui-btn inline-flex items-center gap-1.5 text-xs" disabled={!marcados.size || enviando} onClick={conferir}>
                  {enviando && <Loader2 className="size-3.5 animate-spin" aria-hidden />} Conferir {marcados.size || ""} no tribunal
                </button>
              </div>
            )}
          </div>
          {lista.itens.length === 0 ? (
            <p className="ui-card px-5 py-6 text-sm text-muted">Nenhuma publicação encontrada. Se tiver o número, pesquise pelo número: ele acha processos mesmo sem publicação.</p>
          ) : (
            <ul className="ui-card divide-y divide-border">
              {lista.itens.map((i) => (
                <LinhaAchado
                  key={i.digitos}
                  i={i}
                  marcado={marcados.has(i.numero)}
                  onMarcar={(v) =>
                    setMarcados((s) => {
                      const n = new Set(s);
                      if (v) n.add(i.numero);
                      else n.delete(i.numero);
                      return n;
                    })
                  }
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Aguardando aprovação {pendentes.length > 0 && <span className="text-muted">({pendentes.length})</span>}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value as typeof filtroOrigem)} className="ui-input w-auto py-1 text-xs" aria-label="Filtrar por origem">
              <option value="todos">Todos</option>
              <option value="busca">Pesquisados pela equipe</option>
              <option value="djen">Achados no diário oficial</option>
            </select>
            {prontos.length > 1 && (
              <button type="button" onClick={aprovarTodos} disabled={enviando} className="ui-btn-secondary text-xs">
                Aprovar os {prontos.length} já lidos
              </button>
            )}
          </div>
        </div>
        {pendentes.length === 0 ? (
          <p className="ui-card px-5 py-6 text-sm text-muted">Nada aguardando. Processos achados no diário oficial com número que o portal ainda não tem também aparecem aqui.</p>
        ) : (
          <div className="space-y-4">
            {pendentes.map((c) => (
              <CartaoCandidato key={c.id} c={c} clients={clients} onMudou={() => router.refresh()} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function LinhaAchado({ i, marcado, onMarcar }: { i: Achado; marcado: boolean; onMarcar: (v: boolean) => void }) {
  const podeMarcar = !i.processId && !i.candidatoId && i.digitos.length === 20;
  const partes = i.partes.slice(0, 4).map((p) => p.nome).join(" · ");
  return (
    <li className="flex gap-3 px-4 py-3">
      <input type="checkbox" className="mt-1 size-4 shrink-0" checked={marcado} disabled={!podeMarcar} onChange={(e) => onMarcar(e.target.checked)} aria-label={`Marcar ${i.numero}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="font-semibold text-navy-3 tabular-nums">{i.numero}</p>
          <p className="text-xs text-muted">
            {i.publicacoes} publicação(ões) · última em {dataBR(i.ultimaPublicacao)}
          </p>
        </div>
        <p className="text-sm text-foreground">{[i.classe, i.orgao, i.tribunal].filter(Boolean).join(" · ")}</p>
        {partes && <p className="truncate text-xs text-muted">{partes}</p>}
        <div className="mt-1 text-xs">
          {i.processId ? (
            <Link href={`/admin/processes/${i.processId}`} className="font-medium text-status-success hover:underline">
              Já está no portal · abrir
            </Link>
          ) : i.candidatoId ? (
            <span className="font-medium text-status-pending">{i.candidatoStatus === "lendo" ? "Robô lendo no tribunal" : "Aguardando aprovação (abaixo)"}</span>
          ) : i.digitos.length !== 20 ? (
            <span className="text-muted">Sem número CNJ: cadastre à mão</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
