import Link from "next/link";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { ehSuperAdmin, exigirPermissao } from "@/lib/dal";
import { contarPedidosPrazo, listarPedidosPrazo } from "@/lib/prazo-pedidos";
import { PedidosPrazo } from "./pedidos-prazo";
import { htmlParaTexto } from "@/lib/astrea/texto";
import { alertasDeAndamentos, alertasDePublicacoes, comentariosDe, contadoresAlertas, quandoAlerta, tituloProcesso } from "@/lib/data/alertas";
import { contadoresAndamentos } from "@/lib/data/andamentos";
import { LerAgora } from "../andamentos/ler-agora";
import { ListaAlertas, type ItemAndamento, type ItemPublicacao } from "./lista-alertas";
import { robosComProblema, todosOsRobos } from "@/lib/robos/saude";
import { CardsRobos, TabelaRobos, type RoboTela } from "./saude-robos";
import { contarPorDono, donoDe, filtrarPorDono, filtroDono, pessoasDaEquipe, type DonoFiltro } from "@/lib/publicacoes/dono";

// Alertas no padrão do Astrea: aba Publicações e aba Andamentos. Em cima, cards de robô com
// problema (saúde dos robôs); a aba Robôs mostra a situação de todos.

type Busca = { aba?: string; q?: string; dono?: string };

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });

export default async function AlertasPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { profile, permissoes } = await exigirPermissao("publicacoes");
  const sp = await searchParams;
  const podeAndamentos = !!permissoes.processos;
  // aba Prazos (05/11/2026): pedidos da equipe para mudar prazo, só o admin máximo decide
  const superAdmin = ehSuperAdmin(profile);
  const aba = sp.aba === "andamentos" && podeAndamentos ? "andamentos" : sp.aba === "robos" ? "robos" : sp.aba === "prazos" && superAdmin ? "prazos" : "publicacoes";
  const [contadores, ultima, problemas, nPrazos] = await Promise.all([
    contadoresAlertas(),
    podeAndamentos ? contadoresAndamentos().then((c) => c.ultima) : null,
    robosComProblema().catch(() => [] as RoboTela[]),
    superAdmin ? contarPedidosPrazo().catch(() => 0) : 0,
  ]);

  let lista: React.ReactNode;
  let donoAbas: { chave: string; rotulo: string; n: number; href: string; ativa: boolean }[] = [];
  if (aba === "prazos") {
    const [pendentes, decididos] = await Promise.all([listarPedidosPrazo("pendente"), listarPedidosPrazo("decididos", 20)]);
    lista = <PedidosPrazo pendentes={pendentes} decididos={decididos} />;
  } else if (aba === "robos") {
    lista = <TabelaRobos robos={(await todosOsRobos().catch(() => [])) as RoboTela[]} />;
  } else if (aba === "andamentos") {
    const grupos = await alertasDeAndamentos(sp.q);
    const comentarios = await comentariosDe({ andamentos: grupos.flatMap((g) => g.andamentos.map((a) => a.id)) });
    const qtd = (id: string) => comentarios.filter((c) => c.andamento_id === id).length;
    const itens: ItemAndamento[] = grupos.map((g) => ({
      processId: g.processo.id,
      quando: quandoAlerta(g.recebidoEm),
      titulo: tituloProcesso(g.processo),
      numero: g.processo.numero_processo,
      total: g.andamentos.length,
      importantes: g.importantes,
      andamentos: g.andamentos.map((a) => ({
        id: a.id,
        data: dataBR(a.data),
        texto: a.descricao,
        importante: a.importante,
        comentarios: qtd(a.id) + Number((a.bruto as { commentCount?: number } | null)?.commentCount ?? 0),
      })),
    }));
    lista = <ListaAlertas aba="andamentos" itens={itens} />;
  } else {
    const dono = filtroDono(sp.dono, profile.role);
    const [todas, equipe] = await Promise.all([alertasDePublicacoes(sp.q), pessoasDaEquipe()]);
    const pubs = filtrarPorDono(todas, dono, profile.id, equipe);
    const n = contarPorDono(todas, profile.id, equipe);
    const padrao = filtroDono(undefined, profile.role);
    const href = (d: DonoFiltro) => {
      const q = new URLSearchParams();
      if (d !== padrao) q.set("dono", d);
      if (sp.q) q.set("q", sp.q);
      return `/admin/alertas${q.size ? `?${q}` : ""}`;
    };
    donoAbas = [
      { chave: "minhas", rotulo: "Minhas", n: n.minhas, href: href("minhas"), ativa: dono === "minhas" },
      ...(profile.role === "admin" ? [{ chave: "sem", rotulo: "Sem responsável", n: n.sem, href: href("sem"), ativa: dono === "sem" }] : []),
      { chave: "todas", rotulo: "Todas do escritório", n: n.todas, href: href("todas"), ativa: dono === "todas" },
    ];
    const itens: ItemPublicacao[] = pubs.map((p) => ({
      id: p.id,
      quando: quandoAlerta(p.created_at),
      diario: p.diario ?? p.tribunal ?? "",
      numero: p.numero_mascara ?? p.numero_processo,
      nomePesquisado: p.nome_pesquisado ?? (p.termo ? `OAB ${p.termo}` : null),
      texto: p.texto_html ?? htmlParaTexto(p.texto),
      dono: donoDe(p, equipe),
    }));
    lista = <ListaAlertas aba="publicacoes" itens={itens} equipe={equipe} />;
  }

  const abas = [
    { chave: "publicacoes", rotulo: "Publicações", n: contadores.publicacoes, href: "/admin/alertas" },
    ...(podeAndamentos ? [{ chave: "andamentos", rotulo: "Andamentos", n: contadores.andamentos, href: "/admin/alertas?aba=andamentos" }] : []),
    ...(superAdmin ? [{ chave: "prazos", rotulo: "Prazos", n: nPrazos, href: "/admin/alertas?aba=prazos" }] : []),
    { chave: "robos", rotulo: "Robôs", n: problemas.length, href: "/admin/alertas?aba=robos" },
    { chave: "novidades", rotulo: "Novidades do portal", n: 0, href: "/admin/novidades" },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Caixa de entrada</p>
          <h1 className="page-title">Alertas</h1>
          {ultima && (
            <p className="text-sm text-muted">
              Lidos do Astrea de hora em hora (07h às 22h). Última leitura:{" "}
              {new Date(ultima.iniciado_em).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" })}
              {ultima.erro ? <span className="text-status-danger"> (erro: {ultima.erro})</span> : null}.
            </p>
          )}
        </div>
        {profile.role === "admin" && podeAndamentos && <LerAgora />}
      </div>

      <CardsRobos robos={problemas as RoboTela[]} />

      <nav className="mb-5 flex gap-6 border-b border-border" aria-label="Abas de alertas">
        {abas.map((a) => (
          <Link
            key={a.chave}
            href={a.href}
            aria-current={aba === a.chave ? "page" : undefined}
            className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-[15px] transition-colors ${aba === a.chave ? "border-navy-3 font-medium text-foreground" : "border-transparent text-foreground/65 hover:text-foreground"}`}
          >
            {a.rotulo}
            <span className={`rounded px-1.5 text-[11px] font-semibold ${a.n ? "bg-navy-3 text-white" : "bg-surface-2 text-muted"}`}>{a.n}</span>
          </Link>
        ))}
      </nav>

      {donoAbas.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="De quem são as publicações">
          {donoAbas.map((d) => (
            <Link
              key={d.chave}
              href={d.href}
              aria-current={d.ativa ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13px] font-medium transition-colors ${d.ativa ? "border-navy bg-navy text-white" : "border-border bg-surface text-foreground/75 hover:border-border-strong hover:text-foreground"}`}
            >
              {d.rotulo} <span className={d.ativa ? "text-white/80" : "text-muted"}>{d.n}</span>
            </Link>
          ))}
        </div>
      )}
      {aba !== "robos" && aba !== "prazos" && <BarraFiltros filtros={[{ tipo: "busca", nome: "q", rotulo: aba === "andamentos" ? "Nº do processo, parte ou cliente" : "Nº do processo ou termo" }]} />}
      {lista}
    </div>
  );
}
