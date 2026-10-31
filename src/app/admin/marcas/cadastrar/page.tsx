import Link from "next/link";
import { exigirPermissao } from "@/lib/dal";
import { BuscaCadastro } from "./busca-cadastro";

// Marcas → Cadastrar processos: encontra no INPI por número, nome exato,
// titular ou procurador e põe na carteira (um, os selecionados ou os filtrados).

export default async function CadastrarMarcasPage() {
  await exigirPermissao("marcas");
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Marcas · INPI</p>
          <h1 className="page-title">Cadastrar processos</h1>
        </div>
        <Link href="/admin/marcas/processos" className="ui-btn-secondary">
          Ver minhas marcas
        </Link>
      </div>
      <BuscaCadastro />
    </div>
  );
}
