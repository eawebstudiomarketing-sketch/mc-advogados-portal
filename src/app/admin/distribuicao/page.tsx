import Link from "next/link";
import { Inbox, MessageCircle, Globe, Newspaper, LayoutList } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { listDistribuicao, contadoresDistribuicao, type Trecho } from "@/lib/data/distribuicao";
import { getEscritorioConfig, listPessoas, sugerirResponsavel } from "@/lib/data/escritorio";
import { listClients } from "@/lib/data/clients";
import { createAdminClient } from "@/lib/supabase/admin";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { EmptyState } from "@/components/ui/empty-state";
import { DemandaCard, type DemandaSerial } from "./demanda-card";
import { LoteDistribuicao } from "./lote";
import { DistribuicaoAoVivo } from "./ao-vivo";
import { AtualizarDistribuicao } from "./atualizar";

// Distribuição: a caixa de entrada do escritório. Tudo o que chega de fora e
// ainda não tem dono — grupos dos clientes no WhatsApp (lidos sozinhos assim
// que chega mensagem), pedidos abertos no portal do cliente e publicações do
// Diário/INPI. Cada pedido já vem com área e responsável decididos.

const ORIGENS = [
  { id: "", rotulo: "Tudo", icone: LayoutList, chave: "todas" },
  { id: "whatsapp", rotulo: "WhatsApp", icone: MessageCircle, chave: "whatsapp" },
  { id: "portal_cliente", rotulo: "Portal do cliente", icone: Globe, chave: "portal_cliente" },
  { id: "publicacao", rotulo: "Publicações", icone: Newspaper, chave: "publicacao" },
] as const;

export default async function DistribuicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string; area?: string; cliente?: string; busca?: string }>;
}) {
  await exigirPermissao("distribuicao");
  const f = await searchParams;
  const origem = ORIGENS.some((o) => o.id === f.origem) ? (f.origem ?? "") : "";

  const [lista, cont, config, pessoas, clientes] = await Promise.all([
    listDistribuicao({ ...f, origem: origem || undefined, status: "pendente" }),
    contadoresDistribuicao(),
    getEscritorioConfig(),
    listPessoas(),
    listClients(),
  ]);

  // toda demanda vem com responsável decidido: as que chegaram sem (pedido do
  // portal, por exemplo) ganham agora e ficam gravadas
  const db = createAdminClient();
  for (const d of lista) {
    if (d.responsavel_sugerido) continue;
    const r = await sugerirResponsavel(d.area, pessoas, d.client_id);
    if (r) {
      d.responsavel_sugerido = r;
      await db.from("distribuicao").update({ responsavel_sugerido: r }).eq("id", d.id);
    }
  }

  const demandas: DemandaSerial[] = lista.map((d) => ({
    id: d.id,
    origem: d.origem,
    status: d.status,
    titulo: d.titulo,
    descricao: d.descricao,
    area: d.area,
    tipo: d.tipo,
    prioridade: d.prioridade,
    prazo: d.prazo_sugerido,
    responsavelSugerido: d.responsavel_sugerido ?? d.activities?.responsavel_id ?? null,
    cliente: d.clients ? { id: d.clients.id, nome: d.clients.name } : null,
    atividade: d.activities ? { id: d.activities.id, titulo: d.activities.title } : null,
    publicacao: d.publicacoes ? { id: d.publicacoes.id, link: d.publicacoes.link } : null,
    trechos: (Array.isArray(d.trechos) ? d.trechos : []) as Trecho[],
    criadoEm: d.created_at,
  }));
  const hrefOrigem = (id: string) => {
    const q = new URLSearchParams(Object.entries({ ...f, origem: id }).filter(([, v]) => v) as [string, string][]);
    return `/admin/distribuicao${q.size ? `?${q}` : ""}`;
  };

  return (
    <div>
      <DistribuicaoAoVivo />
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Operacional · Entrada de demandas</p>
          <h1 className="page-title">Distribuição</h1>
          <p className="mt-1 text-sm text-muted">Tudo o que chega de fora, já com responsável. Confira, troque se quiser e crie a atividade.</p>
        </div>
        <AtualizarDistribuicao />
      </div>

      {/* abas por origem, com quantas estão esperando em cada uma */}
      <nav aria-label="Origem" className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        {ORIGENS.map((o) => {
          const on = origem === o.id;
          const n = cont[o.chave];
          const Icone = o.icone;
          return (
            <Link
              key={o.id || "tudo"}
              href={hrefOrigem(o.id)}
              aria-current={on ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-2xl border p-4 transition-colors ${
                on ? "border-navy bg-navy text-white" : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${on ? "bg-white/10 text-gold-2" : "bg-surface-2 text-foreground/70"}`}>
                <Icone className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className={`numero-grande block text-2xl leading-none ${on ? "text-white" : n ? "text-foreground" : "text-foreground/35"}`}>{n}</span>
                <span className={`eyebrow mt-1 block truncate ${on ? "!text-white/60" : ""}`}>{o.rotulo}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "busca", rotulo: "Buscar pedido" },
          { tipo: "select", nome: "area", rotulo: "Área", todos: "Todas as áreas", opcoes: config.areas.map((a) => ({ valor: a, rotulo: a })) },
          { tipo: "select", nome: "cliente", rotulo: "Cliente", todos: "Todos os clientes", opcoes: clientes.map((c) => ({ valor: c.id, rotulo: c.name })) },
        ]}
      />

      <LoteDistribuicao total={demandas.length} />

      {demandas.length === 0 ? (
        <EmptyState icon={Inbox} title="Tudo distribuído">
          <p className="mt-1 max-w-md text-sm text-muted">
            Quando um cliente pedir algo no grupo do WhatsApp, abrir uma solicitação no portal ou sair uma publicação, aparece aqui sozinho.
          </p>
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {demandas.map((d) => (
            <DemandaCard
              key={d.id}
              d={d}
              areas={config.areas}
              responsaveis={pessoas.map((p) => ({ id: p.id, nome: p.nome, areas: p.areas, foto: p.foto }))}
              clientes={clientes.map((c) => ({ id: c.id, nome: c.name }))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
