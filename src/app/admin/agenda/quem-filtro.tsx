import Link from "next/link";
import { Users, UserRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

// De quem é a agenda (só o admin escolhe): minhas, de todos ou de uma pessoa.

export function QuemFiltro({
  pessoas,
  atual,
  href,
}: {
  pessoas: { id: string; nome: string; foto: string | null }[];
  /** "eu", "todos" ou o id da pessoa */
  atual: string;
  href: (quem: string) => string;
}) {
  const base = "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors";
  const on = "border-navy bg-navy text-white";
  const off = "border-border bg-surface text-foreground/75 hover:border-border-strong hover:text-foreground";
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="De quem é a agenda">
      <Link href={href("eu")} className={`${base} ${atual === "eu" ? on : off}`}>
        <UserRound className="h-4 w-4" aria-hidden /> Minhas
      </Link>
      <Link href={href("todos")} className={`${base} ${atual === "todos" ? on : off}`}>
        <Users className="h-4 w-4" aria-hidden /> Todos
      </Link>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden />
      <div className="flex items-center -space-x-1.5">
        {pessoas.map((p) => (
          <Link
            key={p.id}
            href={href(p.id)}
            title={p.nome}
            aria-label={`Agenda de ${p.nome}`}
            aria-current={atual === p.id ? "true" : undefined}
            className={`rounded-full transition-transform hover:z-10 hover:-translate-y-0.5 ${atual === p.id ? "z-10 ring-2 ring-navy ring-offset-2 ring-offset-background" : ""}`}
          >
            <Avatar nome={p.nome} foto={p.foto} tamanho={34} anel />
          </Link>
        ))}
      </div>
      {atual !== "eu" && atual !== "todos" && <span className="ml-1 text-[13px] font-medium text-foreground">{pessoas.find((p) => p.id === atual)?.nome}</span>}
    </div>
  );
}
