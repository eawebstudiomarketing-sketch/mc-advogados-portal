import Link from "next/link";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { exigirPermissao } from "@/lib/dal";
import { htmlParaTexto } from "@/lib/astrea/texto";
import { alertasDeAndamentos, alertasDePublicacoes, comentariosDe, contadoresAlertas, quandoAlerta, tituloProcesso } from "@/lib/data/alertas";
import { contadoresAndamentos } from "@/lib/data/andamentos";
import { LerAgora } from "../andamentos/ler-agora";
import { ListaAlertas, type ItemAndamento, type ItemPublicacao } from "./lista-alertas";
import { robosComProblema, todosOsRobos } from "@/lib/robos/saude";
import { CardsRobos, TabelaRobos, type RoboTela } from "./saude-robos";

// Alertas no padrão do Astrea: aba Publicações e aba Andamentos. Em cima, cards de robô com
// problema (saúde dos robôs); a aba Robôs mostra a situação de todos.

type Busca = { aba?: string; q?: string };

const dataBR = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });

export default async function AlertasPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { profile, permissoes } = await exigirPermissao("publicacoes");
  const sp = await searchParams;
  const podeAndamentos = !!permissoes.processos;
  const aba = sp.aba === "andamentos" && podeAndamentos ? "andamentos" : sp.aba === "robos" ? "robos" : "publicacoes";
  const [contadores, ultima, problemas] = await Promise.all([
    contadoresAlertas(),
    podeAndamentos ? contadoresAndamentos().then((c) => c.ultima) : null,
    robosComProblema().catch(() => [] as RoboTela[]),
  ]);

  let lista: React.ReactNode;
  if (aba === "robos") {
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
    const pubs = await alertasDePublicacoes(sp.q);
    const itens: ItemPublicacao[] = pubs.map((p) => ({
      id: p.id,
      quando: quandoAlerta(p.created_at),
      diario: p.diario ?? p.tribunal ?? "",
      numero: p.numero_mascara ?? p.numero_processo,
      nomePesquisado: p.nome_pesquisado ?? (p.termo ? `OAB ${p.termo}` : null),
      texto: p.texto_html ?? htmlParaTexto(p.texto),
    }));
    lista = <ListaAlertas aba="publicacoes" itens={itens} />;
  }

  const abas = [
    { chave: "publicacoes", rotulo: "Publicações", n: contadores.publicacoes, href: "/admin/alertas" },
    ...(podeAndamentos ? [{ chave: "andamentos", rotulo: "Andamentos", n: contadores.andamentos, href: "/admin/alertas?aba=andamentos" }] : []),
    { chave: "robos", rotulo: "Robôs", n: problemas.length, href: "/admin/alertas?aba=robos" },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Operacional</p>
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

      {aba !== "robos" && <BarraFiltros filtros={[{ tipo: "busca", nome: "q", rotulo: aba === "andamentos" ? "Nº do processo, parte ou cliente" : "Nº do processo ou termo" }]} />}
      {lista}
    </div>
  );
}
