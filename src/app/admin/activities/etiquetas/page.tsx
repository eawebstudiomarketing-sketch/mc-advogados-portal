import { exigirPermissao } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import { listEtiquetas } from "@/lib/data/etiquetas";
import { BackButton } from "@/components/nav/back-button";
import { GerenciarEtiquetas } from "./gerenciar";

// Etiquetas do escritório: renomear, trocar a cor, excluir e criar.
export default async function EtiquetasPage() {
  const { permissoes } = await exigirPermissao("atividades");
  const [etiquetas, { data: usos }] = await Promise.all([
    listEtiquetas(),
    (await createClient()).from("activities").select("etiquetas").not("etiquetas", "eq", "{}"),
  ]);
  const contagem: Record<string, number> = {};
  for (const u of usos ?? []) for (const id of u.etiquetas ?? []) contagem[id] = (contagem[id] ?? 0) + 1;

  return (
    <div className="max-w-3xl">
      <BackButton fallback="/admin/activities" />
      <p className="eyebrow mt-5">Operacional · Atividades</p>
      <h1 className="page-title mt-2">Etiquetas</h1>
      <p className="mt-1 text-sm text-muted">
        {etiquetas.length} etiquetas. Elas aparecem nas atividades e servem de filtro. Para pôr ou tirar de uma atividade, abra a atividade.
      </p>
      <GerenciarEtiquetas etiquetas={etiquetas} contagem={contagem} podeExcluir={permissoes.excluir} />
    </div>
  );
}
