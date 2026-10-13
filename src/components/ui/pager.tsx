import Link from "next/link";

const base = "inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-xs font-medium transition-colors";
const link = `${base} text-foreground hover:bg-surface-2`;
const off = `${base} text-muted/50`;
const current = `${base} bg-navy text-white shadow-sm`;

function pageNumbers(page: number, totalPages: number): (number | "…")[] {
  const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

// Paginação por links (a página é sorteada no servidor). Só aparece quando há
// mais de uma página.
export function Pager({
  page,
  totalPages,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}) {
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Paginação" className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <span className="text-xs text-muted">
        Mostrando {from}–{to} de {total}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} scroll={false} className={link}>
            ← Anterior
          </Link>
        ) : (
          <span className={off}>← Anterior</span>
        )}
        {pageNumbers(page, totalPages).map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted">
              …
            </span>
          ) : n === page ? (
            <span key={n} aria-current="page" className={current}>
              {n}
            </span>
          ) : (
            <Link key={n} href={hrefFor(n)} scroll={false} className={link}>
              {n}
            </Link>
          )
        )}
        {page < totalPages ? (
          <Link href={hrefFor(page + 1)} scroll={false} className={link}>
            Próxima →
          </Link>
        ) : (
          <span className={off}>Próxima →</span>
        )}
      </div>
    </nav>
  );
}
