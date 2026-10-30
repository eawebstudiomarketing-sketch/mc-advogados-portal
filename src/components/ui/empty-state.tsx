import Link from "next/link";
import { Plus, type LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icone,
  title,
  children,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? "py-6" : "py-12"}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted ring-1 ring-border">
        <Icone className="h-5 w-5" aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      {children && <div className="mt-1 max-w-sm text-[13px] text-muted">{children}</div>}
    </div>
  );
}

/**
 * Lista vazia padrão (item 10 da auditoria, 30/10/2026): se há filtro ligado,
 * diz que nada bate com ele; se a lista está vazia de verdade, orienta e
 * oferece o botão para cadastrar o primeiro.
 */
export function ListaVazia({
  icon,
  filtrado,
  titulo,
  dica,
  acao,
}: {
  icon: LucideIcon;
  /** Algum filtro ou busca ligado? */
  filtrado: boolean;
  /** Título quando a lista está vazia de verdade ("Nenhuma atividade ainda"). */
  titulo: string;
  dica?: string;
  acao?: { href: string; rotulo: string };
}) {
  if (filtrado)
    return (
      <EmptyState icon={icon} title="Nada encontrado com esses filtros">
        Tire algum filtro ou mude a busca para ver mais.
      </EmptyState>
    );
  return (
    <EmptyState icon={icon} title={titulo}>
      {dica && <p>{dica}</p>}
      {acao && (
        <Link href={acao.href} className="ui-btn mt-4 inline-flex">
          <Plus className="h-4 w-4" aria-hidden /> {acao.rotulo}
        </Link>
      )}
    </EmptyState>
  );
}
