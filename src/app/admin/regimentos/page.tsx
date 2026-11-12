import Link from "next/link";
import { Plus } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { listRegimentos } from "@/lib/regimentos/dados";
import { ListaRegimentos } from "@/components/regimentos/lista-regimentos";
import { BarraFiltros } from "@/components/ui/barra-filtros";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Regimento Interno (31/10/2026): todos os questionários, de todas as empresas.

export default async function RegimentosPage({ searchParams }: { searchParams: Promise<{ busca?: string; status?: string }> }) {
  await exigirPermissao("onboarding");
  const f = await searchParams;
  const todos = await listRegimentos();
  const termo = semAcento((f.busca ?? "").trim());
  const regimentos = todos.filter((r) => (!termo || semAcento(`${r.titulo} ${r.clients?.name ?? ""} ${r.segmento ?? ""}`).includes(termo)) && (!f.status || r.status === f.status));
  const aguardando = todos.filter((r) => r.status === "enviado").length;
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
      {todos.length > 0 && (
        <BarraFiltros
          filtros={[
            { tipo: "busca", nome: "busca", rotulo: "Buscar empresa ou regimento" },
            {
              tipo: "select",
              nome: "status",
              rotulo: "Situação",
              todos: "Todas as situações",
              opcoes: [
                { valor: "rascunho", rotulo: "Rascunho" },
                { valor: "enviado", rotulo: "Aguardando resposta" },
                { valor: "respondido", rotulo: "Respondido" },
              ],
            },
          ]}
        />
      )}
      <section className="ui-card overflow-hidden">
        <ListaRegimentos regimentos={regimentos} />
      </section>
    </div>
  );
}
