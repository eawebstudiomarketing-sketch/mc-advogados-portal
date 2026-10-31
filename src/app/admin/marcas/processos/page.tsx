import Link from "next/link";
import { FilePlus } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { listMarcas, nomeDaMarca } from "@/lib/marcas/dados";
import { estagioDaSituacao } from "@/lib/marcas/situacao";
import { CarteiraMarcas } from "./carteira";

// Marcas → Processos ("Marcas acompanhadas" no Marca Acompanhada): a carteira,
// com o último despacho, a situação e as ações de cada processo.

export default async function MarcasProcessosPage({ searchParams }: { searchParams: Promise<{ estagio?: string }> }) {
  await exigirPermissao("marcas");
  const { estagio } = await searchParams;
  const todas = await listMarcas();
  const marcas = estagio ? todas.filter((m) => estagioDaSituacao(m.situacao) === estagio) : todas;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Marcas · INPI</p>
          <h1 className="page-title">Marcas acompanhadas</h1>
          <p className="text-sm text-muted">Consulte seus processos, publicações e situações no INPI.</p>
        </div>
        <Link href="/admin/marcas/cadastrar" className="ui-btn">
          <FilePlus className="h-4 w-4" aria-hidden /> Cadastrar processo
        </Link>
      </div>
      {estagio && (
        <p className="text-sm text-muted">
          Mostrando só um estágio · <Link href="/admin/marcas/processos" className="ui-link">ver a carteira toda</Link>
        </p>
      )}
      <CarteiraMarcas
        marcas={marcas.map((m) => ({
          processo: m.processo,
          nome: nomeDaMarca(m),
          imagem: m.imagem,
          despacho: m.ultimo_despacho,
          despachoData: m.ultimo_despacho_data,
          situacao: m.situacao,
          cliente: m.clients?.name ?? m.contato_nome ?? null,
        }))}
      />
    </div>
  );
}
