import type { LucideIcon } from "lucide-react";

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
