import { BarraFiltros } from "@/components/ui/barra-filtros";
import Link from "next/link";
import { Columns3, Gavel, History, List, Pencil, Plus } from "lucide-react";
import { QuadroProcessos } from "./quadro-processos";
import { hojeBahia } from "@/lib/data/painel";
import { ordenar, dataPlanilha } from "@/lib/ordenar";
import { ListaVazia } from "@/components/ui/empty-state";
import { listProcesses } from "@/lib/data/processes";
import { PROCESS_AREA_LABEL } from "@/lib/process-area";
import { StatusBadge } from "@/components/ui/status-badge";
import { deleteProcessAction, trocarResponsavelEmLoteAction, etiquetaEmLoteAction } from "./actions";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { EtiquetasLinha } from "@/components/atividade/etiquetas";
import { SelecaoLista, MarcarTodos, MarcarLinha } from "@/components/ui/selecao-lista";
import { listStaff } from "@/lib/data/team";
import { EditarNaLinha } from "@/components/ui/editar-na-linha";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { exigirPermissao } from "@/lib/dal";

type F = { busca?: string; cliente?: string; area?: string; status?: string; ordem?: string; ver?: string; etiqueta?: string };

export default async function AdminProcessesPage({ searchParams }: { searchParams: Promise<F> }) {
  await exigirPermissao("processos");
  const f = await searchParams;
  const [todos, equipe, etiquetas] = await Promise.all([listProcesses(), listStaff(), listEtiquetas()]);
  const termo = (f.busca ?? "").trim().toLowerCase();
  const digitos = termo.replace(/\D/g, "");
  const filtrados = todos.filter(
    (p) =>
      (!termo ||
        p.numero_processo.toLowerCase().includes(termo) ||
        (digitos.length >= 4 && (p.numero_digitos ?? "").includes(digitos)) ||
        (p.vara_tribunal ?? "").toLowerCase().includes(termo) ||
        (p.fase ?? "").toLowerCase().includes(termo) ||
        (p.clients?.name ?? "").toLowerCase().includes(termo) ||
        (p.titulo ?? "").toLowerCase().includes(termo) ||
        (p.cliente_nome ?? "").toLowerCase().includes(termo)) &&
      (!f.cliente || (f.cliente === "sem" ? !p.client_id : p.client_id === f.cliente)) &&
      (!f.area || p.area === f.area) &&
      (!f.status || p.status === f.status) &&
      (!f.etiqueta || (p.etiquetas ?? []).includes(f.etiqueta))
  );
  const processes = ordenar(filtrados, f.ordem, {
    mov: (p) => p.ultimo_andamento_em,
    numero: (p) => p.numero_processo,
    cliente: (p) => p.clients?.name ?? p.cliente_nome,
    criado: (p) => p.created_at,
  });
  const opcoesResponsavel = [...equipe.filter((e) => e.ativo !== false).map((e) => ({ valor: e.id, rotulo: e.full_name })), { valor: "nenhum", rotulo: "Sem responsável" }];
  const statuses = [...new Set(todos.map((p) => p.status))].sort();
  // três jeitos de ver (item 17): lista, colunas por área e pela última movimentação
  const ver = f.ver === "area" || f.ver === "movimento" ? f.ver : "lista";
  const hrefVer = (v: string) => {
    const q = new URLSearchParams(Object.entries(f).filter(([k, x]) => x && k !== "ver") as [string, string][]);
    if (v !== "lista") q.set("ver", v);
    return `/admin/processes${q.size ? `?${q}` : ""}`;
  };

  return (
    <div>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Processos</p>
          <h1 className="page-title">Processos</h1>
          <p className="text-sm text-muted">
            {processes.length} {processes.length === 1 ? "processo cadastrado" : "processos cadastrados"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface p-1" role="tablist" aria-label="Como ver">
            {([
              ["lista", "Lista", List],
              ["area", "Por área", Columns3],
              ["movimento", "Por movimentação", History],
            ] as const).map(([id, rotulo, Icone]) => (
              <Link
                key={id}
                href={hrefVer(id)}
                role="tab"
                aria-selected={ver === id}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${ver === id ? "bg-navy text-white" : "text-muted hover:text-foreground"}`}
              >
                <Icone className="h-3.5 w-3.5" aria-hidden /> {rotulo}
              </Link>
            ))}
          </div>
          <Link href="/admin/processes/new" className="ui-btn">
            <Plus className="h-4 w-4" aria-hidden /> Novo processo
          </Link>
        </div>
      </div>

      <BarraFiltros
        filtros={[
          { tipo: "busca", nome: "busca", rotulo: "Buscar por número, partes, vara ou cliente" },
          { tipo: "select", nome: "cliente", rotulo: "Cliente", todos: "Todos os clientes", opcoes: [
            ...[...new Map(todos.filter((x) => x.client_id).map((x) => [x.client_id!, x.clients?.name ?? "Cliente"])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([valor, rotulo]) => ({ valor, rotulo })),
            ...(todos.some((x) => !x.client_id) ? [{ valor: "sem", rotulo: "Sem ficha de cliente" }] : []),
          ] },
          { tipo: "select", nome: "area", rotulo: "Área", todos: "Todas as áreas", opcoes: Object.entries(PROCESS_AREA_LABEL).map(([valor, rotulo]) => ({ valor, rotulo })) },
          { tipo: "select", nome: "status", rotulo: "Situação", todos: "Todas as situações", opcoes: statuses.map((s) => ({ valor: s, rotulo: s.replace(/_/g, " ") })) },
          ...(etiquetas.length ? [{ tipo: "select" as const, nome: "etiqueta", rotulo: "Etiqueta", todos: "Todas as etiquetas", opcoes: etiquetas.map((e) => ({ valor: e.id, rotulo: e.nome })) }] : []),
        ]}
        ordenacao={{
          opcoes: [
            { valor: "", rotulo: "Padrão" },
            { valor: "-mov", rotulo: "Movimentação mais recente" },
            { valor: "mov", rotulo: "Movimentação mais antiga" },
            { valor: "numero", rotulo: "Número do processo" },
            { valor: "cliente", rotulo: "Cliente (A a Z)" },
            { valor: "-criado", rotulo: "Cadastrados mais recentes" },
          ],
        }}
        exportar={{
          arquivo: "processos",
          colunas: ["Número", "Título", "Cliente", "Área", "Vara/tribunal", "Fase", "Última movimentação", "Responsável", "Situação"],
          linhas: processes.map((p) => [
            p.numero_processo,
            p.titulo,
            p.clients?.name ?? p.cliente_nome,
            PROCESS_AREA_LABEL[p.area],
            p.vara_tribunal,
            p.fase,
            dataPlanilha(p.ultimo_andamento_em),
            p.profiles?.full_name ?? p.responsavel_nome,
            p.status.replace(/_/g, " "),
          ]),
        }}
      />

      {ver !== "lista" ? (
        <QuadroProcessos processos={processes} como={ver} agora={Date.parse(`${hojeBahia()}T12:00:00-03:00`)} />
      ) : (
      <SelecaoLista
        ids={processes.map((p) => p.id)}
        nome={["processo", "processos"]}
        acoes={[
          {
            tipo: "escolha",
            rotulo: "Trocar responsável",
            icone: "pessoa",
            opcoes: opcoesResponsavel,
            acao: trocarResponsavelEmLoteAction,
            sucesso: "Responsável trocado em {n} processo(s)",
          },
          ...(etiquetas.length
            ? [
                { tipo: "escolha" as const, rotulo: "Pôr etiqueta", icone: "etiqueta" as const, opcoes: etiquetas.map((e) => ({ valor: `+${e.id}`, rotulo: e.nome })), acao: etiquetaEmLoteAction, sucesso: "Etiqueta posta em {n} processo(s)" },
                { tipo: "escolha" as const, rotulo: "Tirar etiqueta", icone: "etiqueta" as const, opcoes: etiquetas.map((e) => ({ valor: `-${e.id}`, rotulo: e.nome })), acao: etiquetaEmLoteAction, sucesso: "Etiqueta tirada de {n} processo(s)" },
              ]
            : []),
        ]}
      >
      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="w-10 py-2.5 pr-0 pl-5"><MarcarTodos /></th>
              <th className="px-5 py-2.5 font-medium">Título</th>
              <th className="px-5 py-2.5 font-medium">Cliente / pasta</th>
              <th className="px-5 py-2.5 font-medium">Ação / foro</th>
              <th className="px-5 py-2.5 font-medium">Últ. mov.</th>
              <th className="px-5 py-2.5 font-medium">Responsável</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
              <th className="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {processes.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <ListaVazia
                    icon={Gavel}
                    filtrado={todos.length > 0}
                    titulo="Nenhum processo cadastrado ainda"
                    dica="Cadastre o primeiro processo e os robôs passam a acompanhar os andamentos dele."
                    acao={{ href: "/admin/processes/new", rotulo: "Novo processo" }}
                  />
                </td>
              </tr>
            )}
            {processes.map((p) => (
              <tr key={p.id}>
                <td className="w-10 py-2.5 pr-0 pl-5"><MarcarLinha id={p.id} rotulo={p.numero_processo} /></td>
                <td className="px-5 py-2.5 font-medium">
                  <Link href={`/admin/processes/${p.id}`} className="text-status-info hover:underline">
                    {p.numero_processo}
                  </Link>
                  {p.titulo && <p className="max-w-xs truncate text-xs font-normal text-muted" title={p.titulo}>{p.titulo}</p>}
                  {(p.etiquetas ?? []).length > 0 && (
                    <div className="mt-1">
                      <EtiquetasLinha ids={p.etiquetas ?? []} todas={etiquetas} />
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-foreground/70">{p.clients?.name ?? (p.cliente_nome ? <span title="Sem ficha no portal">{p.cliente_nome} <span className="text-xs text-muted">(sem ficha)</span></span> : "—")}</td>
                <td className="px-5 py-3 text-foreground/80">
                  {PROCESS_AREA_LABEL[p.area]}
                  <span className="block text-xs text-muted">{p.vara_tribunal ?? "—"}</span>
                </td>
                <td className="px-5 py-3 whitespace-nowrap text-foreground/70">{p.ultimo_andamento_em ? new Date(p.ultimo_andamento_em).toLocaleDateString("pt-BR", { timeZone: "America/Bahia" }) : "—"}</td>
                <td className="px-5 py-3 text-foreground/70">
                  <EditarNaLinha id={p.id} tipo="opcoes" valor={p.responsible_id ?? "nenhum"} opcoes={opcoesResponsavel} rotulo="Responsável" salvar={trocarResponsavelEmLoteAction}>
                    {p.profiles?.full_name ?? p.responsavel_nome ?? "—"}
                  </EditarNaLinha>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-end gap-0.5">
                    <Link href={`/admin/processes/${p.id}/edit`} className="icon-btn" aria-label="Editar" data-tip="Editar"><Pencil aria-hidden /></Link>
                    <ConfirmSubmitButton
                      action={deleteProcessAction}
                      hiddenFields={{ id: p.id }}
                      confirmMessage={`Excluir o processo "${p.numero_processo}"?`}
                      label="Excluir"
                      icon="trash"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </SelecaoLista>
      )}
    </div>
  );
}
