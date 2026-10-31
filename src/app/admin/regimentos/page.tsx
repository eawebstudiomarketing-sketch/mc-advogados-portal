import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { listRegimentos } from "@/lib/regimentos/dados";
import { ListaRegimentos } from "@/components/regimentos/lista-regimentos";

// Regimento Interno (31/10/2026): todos os questionários, de todas as empresas.

export default async function RegimentosPage() {
  await exigirPermissao("onboarding");
  const regimentos = await listRegimentos();
  const aguardando = regimentos.filter((r) => r.status === "enviado").length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Contatos</p>
          <h1 className="page-title">Regimento Interno</h1>
          <p className="text-sm text-muted">
            Questionários por empresa: gere com IA, copie o link e mande para a empresa responder. {aguardando > 0 && `${aguardando} aguardando resposta.`}
          </p>
        </div>
        <Link href="/admin/regimentos/novo" className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> Novo regimento
        </Link>
      </div>
      <section className="ui-card overflow-hidden">
        <ListaRegimentos regimentos={regimentos} />
      </section>
    </div>
  );
}
