import { Avatar } from "@/components/ui/avatar";
import { prazoRelativo, type AtividadeCliente } from "@/lib/data/portal-cliente";

const STATUS = {
  em_andamento: { rotulo: "Em andamento", ponto: "bg-status-info", pilula: "bg-status-info-bg text-status-info" },
  aberta: { rotulo: "Na fila", ponto: "bg-status-pending", pilula: "bg-status-pending-bg text-status-pending" },
  concluida: { rotulo: "Concluída", ponto: "bg-status-success", pilula: "bg-status-success-bg text-status-success" },
  cancelada: { rotulo: "Cancelada", ponto: "bg-muted", pilula: "bg-surface-2 text-muted" },
} as const;

export function StatusPilula({ status }: { status: AtividadeCliente["status"] }) {
  const s = STATUS[status];
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.pilula}`}>{s.rotulo}</span>;
}

// Linha numerada no estilo da lista "Agora" do painel: 01 · ponto · título/meta · pessoa · status.
export function LinhaAtividade({ a, n }: { a: AtividadeCliente; n: number }) {
  const prazo = a.status === "concluida" ? null : prazoRelativo(a.deadline);
  const meta = [
    a.doCliente ? "Pedido seu" : null,
    a.status === "concluida" ? `concluída em ${new Date(a.concluida_em ?? a.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : null,
  ].filter(Boolean);
  return (
    <li className="lista-linha !items-start sm:!items-center">
      <span className="eyebrow w-6 shrink-0 pt-0.5 !text-[11px] sm:pt-0">{String(n).padStart(2, "0")}</span>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full sm:mt-0 ${STATUS[a.status].ponto}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug text-foreground sm:truncate sm:text-sm">{a.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
          {prazo && <span className={prazo.atrasado ? "font-medium text-status-danger" : ""}>{prazo.texto}</span>}
          <span className="sm:hidden">
            <StatusPilula status={a.status} />
          </span>
        </span>
      </span>
      {a.pessoa && (
        <span className="hidden shrink-0 items-center gap-2 md:flex">
          <Avatar nome={a.pessoa.nome} foto={a.pessoa.foto} tamanho={26} />
          <span className="max-w-[9rem] truncate text-xs text-foreground/70">{a.pessoa.nome}</span>
        </span>
      )}
      <span className="hidden sm:block">
        <StatusPilula status={a.status} />
      </span>
    </li>
  );
}
