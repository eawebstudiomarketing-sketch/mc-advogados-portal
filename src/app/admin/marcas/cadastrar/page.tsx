import Link from "next/link";
import { Suspense } from "react";
import { exigirPermissao } from "@/lib/dal";
import { BuscaCadastro } from "./busca-cadastro";
import { createAdminClient } from "@/lib/supabase/admin";

// Marcas → Cadastrar processos: encontra no INPI por número, nome exato,
// titular ou procurador e põe na carteira (um, os selecionados ou os filtrados).
// 09/11/2026: com o INPI fora do ar, busca na base própria (revistas); processo
// ainda não publicado entra com os dados digitados e completa sozinho depois.

export default async function CadastrarMarcasPage() {
  await exigirPermissao("marcas");
  const { data: clientes } = await createAdminClient().from("clients").select("id, name").eq("active", true).order("name").limit(2000);
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
      <Suspense>
        <BuscaCadastro clientes={(clientes ?? []).map((c) => ({ id: c.id, nome: c.name }))} />
      </Suspense>
    </div>
  );
}
