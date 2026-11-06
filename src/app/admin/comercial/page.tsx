import { exigirPermissao } from "@/lib/dal";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { StatCard } from "@/components/ui/stat-card";
import { equipeComercial, listarEtapas, listarFormularios, listarLeads } from "@/lib/crm/dados";
import { Funil } from "./funil";
import { NovoLead } from "./novo-lead";

// CRM / Comercial (06/11/2026): o funil. Cada coluna é uma etapa; arrastar o
// cartão muda a etapa (Perdido pede o motivo; Fechado pede o valor).
// Fechados e perdidos mostram só os últimos 30 dias para a tela não pesar.

const agora = () => Date.now();

type Busca = { q?: string; form?: string; resp?: string };

export default async function ComercialPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { profile } = await exigirPermissao("comercial");
  const sp = await searchParams;
  const [etapas, leads, equipe, formularios] = await Promise.all([
    listarEtapas(),
    listarLeads({ busca: sp.q, formulario: sp.form, responsavel: sp.resp === "meus" ? profile.id : sp.resp }),
    equipeComercial(),
    listarFormularios(),
  ]);
  const tipo = new Map(etapas.map((e) => [e.id, e.tipo]));
  const ha30 = agora() - 30 * 86_400_000;
  const visiveis = leads.filter((l) => (tipo.get(l.etapa_id ?? "") ?? "aberta") === "aberta" || Date.parse(l.ganho_em ?? l.perdido_em ?? l.updated_at) >= ha30);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const doDia = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date(iso));
  const inicial = etapas.find((e) => e.tipo === "aberta");
  const semContato = leads.filter((l) => l.etapa_id === inicial?.id && !l.primeiro_contato_em).length;
  const abertos = leads.filter((l) => (tipo.get(l.etapa_id ?? "") ?? "aberta") === "aberta").length;
  const mes = hoje.slice(0, 7);
  const fechadosMes = leads.filter((l) => l.ganho_em && doDia(l.ganho_em).startsWith(mes));
  const valorMes = fechadosMes.reduce((s, l) => s + (l.valor ?? 0), 0);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Comercial · CRM</p>
          <h1 className="page-title">Funil de leads</h1>
          <p className="text-sm text-muted">Quem respondeu os formulários (e quem foi cadastrado à mão). Arraste o cartão para mudar a etapa.</p>
        </div>
        <NovoLead equipe={equipe} eu={profile.id} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Chegaram hoje" value={String(leads.filter((l) => doDia(l.created_at) === hoje).length)} tone="info" />
        <StatCard label="Novos sem contato" value={String(semContato)} tone={semContato ? "pending" : "default"} />
        <StatCard label="Em aberto" value={String(abertos)} />
        <StatCard label="Fechados no mês" value={String(fechadosMes.length)} hint={valorMes ? valorMes.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : undefined} tone="success" />
      </div>

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "q", rotulo: "Nome, empresa, WhatsApp ou e-mail" },
          { tipo: "select", nome: "form", rotulo: "Formulário", todos: "Todos os formulários", opcoes: formularios.map((f) => ({ valor: f.id, rotulo: f.nome })) },
          { tipo: "select", nome: "resp", rotulo: "Responsável", todos: "Todos", opcoes: [{ valor: "meus", rotulo: "Só os meus" }, { valor: "sem", rotulo: "Sem responsável" }, ...equipe.map((p) => ({ valor: p.id, rotulo: p.nome }))] },
        ]}
      />

      <Funil
        etapas={etapas}
        leads={visiveis.map((l) => ({
          id: l.id,
          nome: l.nome,
          empresa: l.empresa,
          telefone: l.telefone,
          etapa_id: l.etapa_id ?? inicial?.id ?? null,
          responsavel: l.responsavel,
          formulario: formularios.find((f) => f.id === l.formulario_id)?.nome ?? (l.origem === "manual" ? "Cadastro manual" : l.origem),
          origem: l.utm?.source ?? null,
          created_at: l.created_at,
          proximo_contato: l.proximo_contato,
          contatado: !!l.primeiro_contato_em,
          valor: l.valor,
        }))}
        equipe={equipe}
      />
    </div>
  );
}
