import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AlertTriangle, Mic, NotebookPen, Plus } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { BarraFiltros } from "@/components/ui/barra-filtros";
import { dataHoraBr, STATUS_ROTULO, TIPOS_ATA, type StatusAta, type TipoAta } from "@/lib/atas/formato";

export const metadata = { title: "Reuniões" };

const COR: Record<StatusAta, string> = {
  gravando: "bg-status-danger-bg text-status-danger",
  processando: "bg-surface-2 text-foreground/70",
  gerando: "bg-surface-2 text-foreground/70",
  transcrita: "bg-status-info-bg text-status-info",
  rascunho: "bg-status-pending-bg text-status-pending",
  erro: "bg-status-danger-bg text-status-danger",
  aguardando: "bg-status-info-bg text-status-info",
  aprovada: "bg-status-success-bg text-status-success",
  assinada: "bg-status-success-bg text-status-success",
};

// Reuniões: grava (ou recebe o arquivo), transcreve e entrega a reunião (texto fiel +
// resumo com IA). Dali, "Gerar ata" monta a ata no modelo do escritório, o advogado
// revisa e aprova e o portal colhe as assinaturas (link + código).
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default async function AtasPage({ searchParams }: { searchParams: Promise<{ busca?: string; status?: string; cliente?: string; tipo?: string }> }) {
  const f = await searchParams;
  const { profile } = await exigirPermissao("atas");
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data } = await db
    .from("atas")
    .select("id, titulo, tipo, status, data_reuniao, versao, profile_id, clients(name), profiles!atas_profile_id_fkey(full_name), ata_assinaturas(status, versao)")
    .order("data_reuniao", { ascending: false })
    .limit(f.busca || f.status || f.cliente || f.tipo ? 2000 : 200);
  type Linha = {
    id: string;
    titulo: string;
    tipo: TipoAta;
    status: StatusAta;
    data_reuniao: string;
    versao: number;
    profile_id: string;
    clients: { name: string } | null;
    profiles: { full_name: string } | null;
    ata_assinaturas: { status: string; versao: number }[];
  };
  const todas = (data ?? []) as unknown as Linha[];
  const termo = semAcento((f.busca ?? "").trim());
  const atas = todas.filter(
    (a) =>
      (!termo || semAcento(`${a.titulo} ${a.clients?.name ?? ""} ${a.profiles?.full_name ?? ""}`).includes(termo)) &&
      (!f.status || a.status === f.status) &&
      (!f.tipo || a.tipo === f.tipo) &&
      (!f.cliente || a.clients?.name === f.cliente)
  );
  const nomesClientes = [...new Set(todas.map((a) => a.clients?.name).filter((n): n is string => !!n))].sort((x, y) => x.localeCompare(y));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Arquivos · Reuniões</p>
          <h1 className="page-title">Reuniões</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Grave a reunião (pode deixar a aba em segundo plano) ou envie o arquivo. Você recebe a transcrição fiel e o resumo com IA, para baixar em PDF, TXT ou Word. Se precisar de ata, é só clicar em “Gerar ata” dentro da reunião: a IA monta no modelo do escritório, você revisa e aprova, e o portal colhe as assinaturas.</p>
        </div>
        <Link href="/admin/atas/nova" className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> Nova reunião
        </Link>
      </div>

      {/* 11/11/2026: gravação que a pessoa não encerrou (aba fechada) fica em destaque para recuperar */}
      {atas
        .filter((a) => a.status === "gravando" && a.profile_id === profile.id)
        .map((a) => (
          <Link
            key={`pendente-${a.id}`}
            href={`/admin/atas/${a.id}`}
            className="mb-4 flex items-start gap-3 rounded-xl border border-status-danger/30 bg-status-danger-bg p-4 text-sm text-status-danger transition-colors hover:border-status-danger/60"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <strong>Gravação não encerrada: {a.titulo}</strong> ({dataHoraBr(a.data_reuniao)}). Se a aba foi fechada sem “Encerrar”, abra aqui, neste mesmo computador, para recuperar o que foi gravado e transcrever.
            </span>
          </Link>
        ))}

      {todas.length > 0 && (
        <BarraFiltros
          filtros={[
            { tipo: "busca", nome: "busca", rotulo: "Buscar reunião, cliente ou pessoa" },
            { tipo: "select", nome: "cliente", rotulo: "Cliente", todos: "Todos os clientes", opcoes: nomesClientes.map((n) => ({ valor: n, rotulo: n })) },
            { tipo: "select", nome: "status", rotulo: "Situação", todos: "Todas as situações", opcoes: Object.entries(STATUS_ROTULO).map(([valor, rotulo]) => ({ valor, rotulo })) },
            { tipo: "select", nome: "tipo", rotulo: "Tipo", todos: "Todos os tipos", opcoes: Object.entries(TIPOS_ATA).map(([valor, t]) => ({ valor, rotulo: t.rotulo })) },
          ]}
        />
      )}

      {todas.length > 0 && atas.length === 0 ? (
        <div className="ui-card px-6 py-10 text-center text-sm text-muted">Nenhuma reunião com esses filtros.</div>
      ) : atas.length === 0 ? (
        <div className="ui-card flex flex-col items-center px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-foreground/70 ring-1 ring-border">
            <NotebookPen className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-3 font-medium text-foreground">Nenhuma reunião ainda</p>
          <p className="mt-1 text-sm text-muted">Comece em “Nova reunião”: grave e a transcrição sai pronta. A ata é um clique depois.</p>
        </div>
      ) : (
        <div className="ui-card overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {atas.map((a) => {
              const atuais = a.ata_assinaturas.filter((s) => s.versao === a.versao && s.status !== "cancelada");
              const feitas = atuais.filter((s) => s.status === "assinada").length;
              return (
                <li key={a.id}>
                  <Link href={`/admin/atas/${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 transition-colors hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">
                        {a.titulo}
                        {a.clients?.name ? <span className="font-normal text-muted"> · {a.clients.name}</span> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {dataHoraBr(a.data_reuniao)} · {TIPOS_ATA[a.tipo].rotulo}
                        {profile.role === "admin" && a.profile_id !== profile.id && a.profiles?.full_name ? ` · ${a.profiles.full_name}` : ""}
                        {a.versao > 1 ? ` · versão ${a.versao}` : ""}
                      </span>
                    </span>
                    {a.status === "aguardando" && atuais.length > 0 && (
                      <span className="text-xs text-muted tabular-nums">
                        {feitas} de {atuais.length} assinaram
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${COR[a.status]}`}>
                      {a.status === "gravando" && <Mic className="h-3 w-3" aria-hidden />}
                      {STATUS_ROTULO[a.status]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
