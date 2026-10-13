import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Cabeçalho padrão das telas: voltar (opcional), título, uma linha de apoio
// e as ações à direita.
export function PageHeader({
  title,
  description,
  back,
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-7">
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-muted transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="page-title text-balance">{title}</h1>
          {description && <div className="mt-1 text-sm text-muted">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
