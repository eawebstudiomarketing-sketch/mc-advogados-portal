import { BarraFiltros } from "@/components/ui/barra-filtros";
import Link from "next/link";
import { BellRing, CheckCheck, Inbox, X } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { StatCard } from "@/components/ui/stat-card";
import {
  contadoresPublicacoes,
  getPublicacao,
  listPublicacoes,
  STATUS_PUBLICACAO,
  taxasDeSugestao,
  type PublicacaoStatus,
} from "@/lib/data/publicacoes";
import { PublicacaoCard } from "./publicacao-card";
import { BuscarAgora } from "./buscar-agora";
import { FerramentasLista } from "./ferramentas-lista";
import { AtivarCelular } from "./ativar-celular";
import { adicionarOabAction, alternarOabAction, removerOabAction, salvarEmailAlertaAction, salvarProcuradoresInpiAction } from "./actions";

type Busca = { status?: string; tribunal?: string; uf?: string; de?: string; ate?: string; q?: string; p?: string };

const FILTROS: (PublicacaoStatus | "todas")[] = ["nao_tratada", "tratada", "descartada", "todas"];

export default async function PublicacoesPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { profile } = await exigirPermissao("publicacoes");
  const sp = await searchParams;
  const admin = profile.role === "admin";
  const status = (FILTROS as string[]).includes(sp.status ?? "") ? (sp.status as PublicacaoStatus | "todas") : "nao_tratada";

  const [contadores, destaque, lista, taxas] = await Promise.all([
    contadoresPublicacoes(),
    sp.p ? getPublicacao(sp.p) : Promise.resolve(null),
    sp.p ? Promise.resolve([]) : listPublicacoes({ status, tribunal: sp.tribunal, uf: sp.uf, de: sp.de, ate: sp.ate, busca: sp.q }),
    taxasDeSugestao(),
  ]);

  const hrefFiltro = (novo: Partial<Busca>) => {
    const q = new URLSearchParams();
    const m = { status, tribunal: sp.tribunal, uf: sp.uf, de: sp.de, ate: sp.ate, q: sp.q, ...novo };
    if (m.status && m.status !== "nao_tratada") q.set("status", m.status);
    if (m.tribunal) q.set("tribunal", m.tribunal);
    if (m.uf) q.set("uf", m.uf);
    if (m.de) q.set("de", m.de);
    if (m.ate) q.set("ate", m.ate);
    if (m.q) q.set("q", m.q);
    const s = q.toString();
    return `/admin/publicacoes${s ? `?${s}` : ""}`;
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Operacional · Diário oficial e INPI</p>
          <h1 className="page-title">Publicações</h1>
          <p className="text-sm text-muted">Intimações do Diário de Justiça Eletrônico Nacional (DJEN), buscadas a cada 2 horas das 06h às 22h, e despachos de marcas na revista semanal do INPI.</p>
        </div>
        {admin && <BuscarAgora />}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Não tratadas" value={String(contadores.pendentes)} tone={contadores.pendentes ? "pending" : "default"} icon={Inbox} href="/admin/publicacoes" />
        <StatCard label="Recebidas hoje" value={String(contadores.recebidasHoje)} tone="info" icon={BellRing} />
        <StatCard label="Tratadas hoje" value={String(contadores.tratadasHoje)} tone="success" icon={CheckCheck} href={hrefFiltro({ status: "tratada" })} />
        <StatCard label="Descartadas hoje" value={String(contadores.descartadasHoje)} icon={X} href={hrefFiltro({ status: "descartada" })} />
      </div>

      {destaque ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Mostrando a publicação do aviso por e-mail ·{" "}
            <Link href="/admin/publicacoes" className="font-medium text-navy-3 hover:underline">
              ver todas as não tratadas
            </Link>
          </p>
          <PublicacaoCard p={destaque} destaque taxas={taxas} />
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {FILTROS.map((f) => (
              <Link
                key={f}
                href={hrefFiltro({ status: f })}
                className={`inline-flex h-9 items-center rounded-full border px-4 text-[13px] font-medium transition-colors ${status === f ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/75 hover:border-border-strong hover:text-foreground"}`}
              >
                {f === "todas" ? "Todas" : STATUS_PUBLICACAO[f]}
              </Link>
            ))}
          </div>
          <BarraFiltros
            filtros={[
              { tipo: "busca", nome: "q", rotulo: "Nº do processo ou termo" },
              { tipo: "select", nome: "uf", rotulo: "Estado", todos: "Todos os estados", opcoes: contadores.ufs.map((u) => ({ valor: u, rotulo: u })) },
              { tipo: "select", nome: "tribunal", rotulo: "Tribunal", todos: "Todos os tribunais", opcoes: contadores.tribunais.map((x) => ({ valor: x, rotulo: x })) },
              { tipo: "data", nome: "de", rotulo: "De" },
              { tipo: "data", nome: "ate", rotulo: "Até" },
            ]}
          />

          <FerramentasLista total={lista.length} selecionavel={status === "nao_tratada" || status === "todas"} />
          {lista.length === 100 && <p className="mb-3 text-xs text-muted">Mostrando as 100 mais recentes. Use os filtros para ver as anteriores.</p>}
          <div className="space-y-3">
            {lista.length === 0 && (
              <div className="ui-card px-5 py-12 text-center text-sm text-muted">
                {status === "nao_tratada" ? "Nenhuma publicação esperando tratamento. 🎉" : "Nenhuma publicação com esse filtro."}
              </div>
            )}
            {lista.map((p) => (
              <PublicacaoCard key={p.id} p={p} selecionavel taxas={taxas} />
            ))}
          </div>
        </>
      )}

      {admin && <Monitoramento />}
    </div>
  );
}

async function Monitoramento() {
  const supabase = await createClient();
  const [{ data: oabs }, { data: cfg }, { data: execs }] = await Promise.all([
    supabase.from("monitor_oabs").select("*").order("created_at"),
    supabase.from("monitor_config").select("email_alerta, inpi_procuradores, inpi_ultima_revista").eq("id", 1).maybeSingle(),
    supabase.from("monitor_execucoes").select("*").order("iniciado_em", { ascending: false }).limit(5),
  ]);

  return (
    <section className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="ui-card p-5">
        <h2 className="section-title">Monitoramento · OABs</h2>
        <p className="mt-1 text-xs text-muted">O robô busca no DJEN todas as intimações em que estas OABs aparecem.</p>
        <ul className="mt-3 divide-y divide-border">
          {(oabs ?? []).map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${o.ativo ? "text-foreground" : "text-muted line-through"}`}>
                  OAB {o.numero}/{o.uf}
                </p>
                {o.nome && <p className="truncate text-xs text-muted">{o.nome}</p>}
              </div>
              <div className="flex items-center gap-1.5">
                <form action={alternarOabAction}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="ativo" value={String(!o.ativo)} />
                  <button type="submit" className="ui-btn-secondary px-2.5 py-1 text-xs">
                    {o.ativo ? "Pausar" : "Ativar"}
                  </button>
                </form>
                <form action={removerOabAction}>
                  <input type="hidden" name="id" value={o.id} />
                  <button type="submit" className="icon-btn" aria-label="Remover" data-tip="Remover">
                    <X aria-hidden />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
        <form action={adicionarOabAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input name="numero" required inputMode="numeric" placeholder="Nº OAB" className="ui-input w-28 py-1.5 text-sm" />
          <input name="uf" required maxLength={2} placeholder="UF" className="ui-input w-16 py-1.5 text-sm uppercase" />
          <input name="nome" placeholder="Nome do advogado (opcional)" className="ui-input min-w-0 flex-1 py-1.5 text-sm" />
          <button type="submit" className="ui-btn px-3 py-1.5 text-xs">
            Adicionar
          </button>
        </form>
      </div>

      <div className="ui-card p-5">
        <h2 className="section-title">Aviso por e-mail</h2>
        <p className="mt-1 text-xs text-muted">Quando chegar publicação nova, um e-mail com a lista vai para:</p>
        <form action={salvarEmailAlertaAction} className="mt-3 flex gap-2">
          <input name="email" type="email" defaultValue={cfg?.email_alerta ?? ""} placeholder="email@exemplo.com" className="ui-input py-1.5 text-sm" />
          <button type="submit" className="ui-btn-secondary px-3 py-1.5 text-xs">
            Salvar
          </button>
        </form>

        <div className="mt-6">
          <AtivarCelular />
        </div>

        <h2 className="section-title mt-6">INPI · marcas</h2>
        <p className="mt-1 text-xs text-muted">
          Toda terça sai a Revista da Propriedade Industrial. Entram os processos de marca em que o procurador é um destes nomes (um por linha).
          {cfg?.inpi_ultima_revista ? ` Última revista lida: nº ${cfg.inpi_ultima_revista}.` : " Nenhuma revista lida ainda."}
        </p>
        <form action={salvarProcuradoresInpiAction} className="mt-3 flex flex-col gap-2">
          <textarea
            name="procuradores"
            rows={2}
            defaultValue={(cfg?.inpi_procuradores ?? []).join("\n")}
            className="ui-input py-1.5 text-sm"
          />
          <button type="submit" className="ui-btn-secondary self-start px-3 py-1.5 text-xs">
            Salvar nomes
          </button>
        </form>

        <h3 className="mt-6 text-xs font-semibold tracking-wide text-muted uppercase">Últimas buscas</h3>
        <ul className="mt-2 space-y-1.5 text-xs">
          {(execs ?? []).length === 0 && <li className="text-muted">Nenhuma busca ainda.</li>}
          {(execs ?? []).map((e) => (
            <li key={e.id} className="flex justify-between gap-3">
              <span className="text-muted">
                {new Date(e.iniciado_em).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" })} ·{" "}
                {e.origem === "cron" ? "automática" : "manual"}
              </span>
              <span className={e.erro ? "text-status-danger" : "text-foreground/80"}>
                {e.erro ? `Erro: ${e.erro}` : `${e.novas} nova(s) · ${e.encontradas} no DJEN`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
