import Link from "next/link";
import { Users, CalendarClock, AlertTriangle, ArrowRight, CalendarCheck2, Inbox, Plus } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { listClients } from "@/lib/data/clients";
import { listActivities, type Activity } from "@/lib/data/activities";
import { listFinancialRecords } from "@/lib/data/financial";
import { responsavelDoPerfil } from "@/lib/data/responsaveis";
import { exigirPermissao } from "@/lib/dal";
import { formatCurrency } from "@/lib/mock-data";
import { QuadroInicial } from "./quadro-inicial";

const hojeBahia = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

function saudacao() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const diasAte = (iso: string, hoje: string) => Math.round((Date.parse(iso) - Date.parse(hoje)) / 86_400_000);
const CONCLUIDAS_DIAS = 14;

// Visão geral: tudo o que a pessoa precisa de uma vez. Números do dia, o quadro
// das atividades (abre nas dela; aba com todas dos clientes dela) e os clientes.
export default async function AdminOverviewPage() {
  const { profile, permissoes } = await exigirPermissao("visao_geral");
  const isAdmin = profile.role === "admin";

  const [clients, activities, financeiro, meuResponsavel] = await Promise.all([
    listClients(),
    listActivities(),
    isAdmin ? listFinancialRecords() : Promise.resolve(null),
    responsavelDoPerfil(profile.id),
  ]);

  const hoje = hojeBahia();
  const corte = Date.parse(hoje) - CONCLUIDAS_DIAS * 86_400_000;
  // no quadro: abertas + concluídas recentes (as antigas ficam na tela Atividades)
  const noQuadro = activities.filter(
    (a) => a.status === "aberta" || a.status === "em_andamento" || (a.status === "concluida" && Date.parse(a.updated_at) >= corte)
  );
  const ehMinha = (a: Activity) =>
    (meuResponsavel ? a.responsavel_id === meuResponsavel : false) || (!a.responsavel_id && a.responsible_id === profile.id);
  const minhas = noQuadro.filter(ehMinha);

  const abertasMinhas = minhas.filter((a) => a.status === "aberta" || a.status === "em_andamento");
  const atrasadas = abertasMinhas.filter((a) => a.deadline && diasAte(a.deadline, hoje) < 0);
  const deHoje = abertasMinhas.filter((a) => a.deadline && diasAte(a.deadline, hoje) === 0);
  const daSemana = abertasMinhas.filter((a) => a.deadline && diasAte(a.deadline, hoje) > 0 && diasAte(a.deadline, hoje) <= 7);
  const abertas = activities.filter((a) => a.status === "aberta" || a.status === "em_andamento");
  const inadimplentes = financeiro?.filter((f) => f.status === "overdue") ?? [];

  const clientesAtivos = clients
    .filter((c) => c.active)
    .map((c) => ({ ...c, pendentes: abertas.filter((a) => a.client_id === c.id).length }))
    .sort((a, b) => b.pendentes - a.pendentes || a.name.localeCompare(b.name));

  const primeiroNome = profile.full_name.split(" ")[0] ?? "";
  const dataLonga = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Bahia", weekday: "long", day: "numeric", month: "long" });
  const dataExtenso = dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1);

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-muted">{dataExtenso}</p>
        <h1 className="page-title mt-0.5">
          {saudacao()}
          {primeiroNome ? `, ${primeiroNome}` : ""}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Suas atrasadas" value={String(atrasadas.length)} icon={AlertTriangle} tone={atrasadas.length ? "danger" : "success"} />
        <StatCard label="Vencem hoje" value={String(deHoje.length)} icon={CalendarCheck2} tone="pending" />
        <StatCard label="Próximos 7 dias" value={String(daSemana.length)} icon={CalendarClock} tone="info" />
        <StatCard
          label={isAdmin ? "Clientes ativos" : "Seus clientes"}
          value={String(clientesAtivos.length)}
          icon={Users}
          href={permissoes.clientes ? "/admin/clients" : undefined}
        />
      </div>

      {isAdmin && inadimplentes.length > 0 && (
        <Link
          href="/admin/financial"
          className="mt-3 flex items-center gap-2 rounded-xl border border-status-danger/25 bg-status-danger/[0.06] px-4 py-2.5 text-sm text-status-danger transition-colors hover:bg-status-danger/[0.1]"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          {inadimplentes.length} cobrança(s) em atraso · {formatCurrency(inadimplentes.reduce((s, f) => s + Number(f.amount), 0))}
          <ArrowRight className="ml-auto h-4 w-4" aria-hidden />
        </Link>
      )}

      <div className="mt-6">
        <QuadroInicial minhas={minhas} todas={noQuadro} rotuloTodas={isAdmin ? "Todas do escritório" : "Dos meus clientes"} />
        <p className="mt-2 text-xs text-muted">
          Concluídas dos últimos {CONCLUIDAS_DIAS} dias. Arraste o cartão para mudar o status; clique para abrir.{" "}
          <Link href="/admin/activities" className="ui-link">
            Ver todas as atividades
          </Link>
        </p>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">{isAdmin ? "Clientes" : "Seus clientes"}</h2>
          <div className="flex items-center gap-4">
            <Link href="/admin/clients/new" className="ui-link">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Cadastrar cliente
            </Link>
            {permissoes.clientes && (
              <Link href="/admin/clients" className="ui-link">
                Todos <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
        </div>
        {clientesAtivos.length === 0 ? (
          <EmptyState icon={Inbox} title={isAdmin ? "Nenhum cliente ativo" : "Nenhum cliente designado a você ainda"} compact />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {clientesAtivos.slice(0, 12).map((c) => {
              const conteudo = (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy text-xs font-semibold text-gold-2">
                    {c.name.replace(/[^A-Za-zÀ-ú0-9 ]/g, "").trim().slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted">
                      {c.pendentes ? `${c.pendentes} em aberto` : "Sem pendências"} · {c.tipo_pessoa}
                    </p>
                  </div>
                </>
              );
              return permissoes.clientes ? (
                <Link
                  key={c.id}
                  href={`/admin/clients/${c.id}`}
                  className="ui-card group flex items-center gap-3 p-3.5 transition-[box-shadow,border-color] duration-200 hover:border-border-strong hover:shadow-md"
                >
                  {conteudo}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </Link>
              ) : (
                <div key={c.id} className="ui-card flex items-center gap-3 p-3.5">
                  {conteudo}
                </div>
              );
            })}
          </div>
        )}
        {clientesAtivos.length > 12 && permissoes.clientes && (
          <Link href="/admin/clients" className="ui-link mt-3">
            Ver mais {clientesAtivos.length - 12} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </section>
    </div>
  );
}
