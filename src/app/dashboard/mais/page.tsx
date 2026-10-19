import Link from "next/link";
import { FileBarChart2, Gavel, ListChecks, LogOut, UserRound, type LucideIcon } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { logout } from "@/app/logout/actions";

const ITENS: { href: string; titulo: string; texto: string; icone: LucideIcon }[] = [
  { href: "/dashboard/activities", titulo: "Todas as atividades", texto: "Em andamento, na fila e concluídas", icone: ListChecks },
  { href: "/dashboard/processos", titulo: "Processos", texto: "Seus processos acompanhados pelo escritório", icone: Gavel },
  { href: "/dashboard/relatorios", titulo: "Relatórios", texto: "Resumo da semana e do mês, em PDF", icone: FileBarChart2 },
  { href: "/account", titulo: "Minha conta", texto: "Nome, e-mail e senha", icone: UserRound },
];

export default async function MaisPage() {
  await requireRole(["client"]);

  return (
    <div>
      <p className="eyebrow">Mais</p>
      <h1 className="page-title mt-2">Outras opções.</h1>
      <ol className="mt-6 border-b border-border">
        {ITENS.map((it, i) => (
          <li key={it.href}>
            <Link href={it.href} className="lista-linha group">
              <span className="eyebrow w-6 shrink-0 !text-[11px]">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy/[0.06] text-navy">
                <it.icone className="h-[18px] w-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-foreground sm:text-sm">{it.titulo}</span>
                <span className="block truncate text-xs text-muted">{it.texto}</span>
              </span>
              <span className="eyebrow shrink-0 transition-colors group-hover:!text-foreground">Abrir ›</span>
            </Link>
          </li>
        ))}
      </ol>
      <form action={logout} className="mt-8">
        <button type="submit" className="ui-btn-secondary">
          <LogOut className="h-4 w-4" aria-hidden /> Sair
        </button>
      </form>
    </div>
  );
}
