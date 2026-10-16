import Link from "next/link";
import { Inbox } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { listDistribuicao, contadoresDistribuicao, type Trecho } from "@/lib/data/distribuicao";
import { getEscritorioConfig, listPessoas } from "@/lib/data/escritorio";
import { listClients } from "@/lib/data/clients";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { EmptyState } from "@/components/ui/empty-state";
import { DemandaCard, type DemandaSerial } from "./demanda-card";
import { LerZapAgora } from "./ler-zap-agora";
import { LoteDistribuicao } from "./lote";

// Distribuição: tudo o que chega de fora (grupos do cliente no WhatsApp,
// pedidos abertos no portal do cliente) e ainda não tem dono. Cada cartão
// já vem com área e responsável sugeridos; um clique cria a atividade.

const STATUS = [
  ["pendente", "Para distribuir"],
  ["aceita", "Distribuídas"],
  ["descartada", "Descartadas"],
] as const;

export default async function DistribuicaoPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; origem?: string; area?: string; cliente?: string; busca?: string }>;
}) {
  const { profile } = await exigirPermissao("distribuicao");
  const f = await searchParams;
  const status = STATUS.some(([s]) => s === f.status) ? f.status! : "pendente";

  const [lista, cont, config, pessoas, clientes] = await Promise.all([
    listDistribuicao({ ...f, status }),
    contadoresDistribuicao(),
    getEscritorioConfig(),
    listPessoas(),
    listClients(),
  ]);

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
    trechos: (Array.isArray(d.trechos) ? d.trechos : []) as Trecho[],
    criadoEm: d.created_at,
  }));
  const qs = (s: string) => {
    const q = new URLSearchParams(Object.entries({ ...f, status: s }).filter(([, v]) => v) as [string, string][]);
    if (s === "pendente") q.delete("status");
    return q.size ? `?${q}` : "";
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Dia a dia · Entrada de demandas</p>
          <h1 className="page-title">Distribuição</h1>
          <p className="text-sm text-muted">
            Pedidos que chegam de fora: grupos dos clientes no WhatsApp (lidos pela IA de hora em hora) e solicitações abertas no portal do cliente.
          </p>
        </div>
        {profile.role === "admin" && <LerZapAgora />}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Para distribuir", cont.pendentes, "text-status-pending"],
          ["Do WhatsApp", cont.zap, "text-[#1f7a43]"],
          ["Do portal do cliente", cont.portal, "text-status-info"],
          ["Resolvidas hoje", cont.hoje, "text-status-success"],
        ].map(([rotulo, n, cor]) => (
          <div key={rotulo as string} className="ui-card p-5">
            <p className={`numero-grande text-[2.25rem] leading-none ${n ? cor : "text-foreground"}`}>{n}</p>
            <p className="eyebrow mt-2">{rotulo}</p>
          </div>
        ))}
      </div>

      <nav aria-label="Situação" className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {STATUS.map(([s, rotulo]) => (
          <Link
            key={s}
            href={`/admin/distribuicao${qs(s)}`}
            aria-current={status === s ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${status === s ? "border-navy-3 font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {rotulo}
            {s === "pendente" && cont.pendentes > 0 && <span className="ml-1.5 rounded-full bg-gold px-1.5 text-[10px] font-semibold text-navy-2">{cont.pendentes}</span>}
          </Link>
        ))}
      </nav>

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "busca", rotulo: "Buscar no título ou na descrição" },
          {
            tipo: "select",
            nome: "origem",
            rotulo: "Origem",
            todos: "Todas as origens",
            opcoes: [
              { valor: "whatsapp", rotulo: "WhatsApp" },
              { valor: "portal_cliente", rotulo: "Portal do cliente" },
            ],
          },
          { tipo: "select", nome: "area", rotulo: "Área", todos: "Todas as áreas", opcoes: config.areas.map((a) => ({ valor: a, rotulo: a })) },
          { tipo: "select", nome: "cliente", rotulo: "Cliente", todos: "Todos os clientes", opcoes: clientes.map((c) => ({ valor: c.id, rotulo: c.name })) },
        ]}
      />

      {status === "pendente" && <LoteDistribuicao total={demandas.length} />}

      {demandas.length === 0 ? (
        <EmptyState icon={Inbox} title={status === "pendente" ? "Nada para distribuir" : "Nenhuma demanda aqui"}>
          {status === "pendente" && (
            <p className="mt-1 max-w-md text-sm text-muted">
              Quando um cliente pedir algo no grupo do WhatsApp ou abrir uma solicitação no portal, aparece aqui.
            </p>
          )}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {demandas.map((d) => (
            <DemandaCard
              key={d.id}
              d={d}
              areas={config.areas}
              responsaveis={pessoas.map((p) => ({ id: p.id, nome: p.nome, areas: p.areas }))}
              selecionavel={status === "pendente"}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
