import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/dal";
import { PageHeader } from "@/components/ui/page-header";
import { equipeComercial, formularioPorId } from "@/lib/crm/dados";
import { CONFIG_VAZIA } from "@/lib/crm/tipos";
import { EditorFormulario } from "./editor";

// Editor do formulário (CRM, 06/11/2026). "novo" cria um em branco.

export default async function EditarFormularioPage({ params }: { params: Promise<{ id: string }> }) {
  const { permissoes } = await exigirPermissao("comercial");
  const { id } = await params;
  const novo = id === "novo";
  if (!novo && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [form, equipe] = await Promise.all([novo ? null : formularioPorId(id), equipeComercial()]);
  if (!novo && !form) notFound();
  return (
    <div>
      <PageHeader back={{ href: "/admin/comercial/formularios", label: "Formulários" }} title={form?.nome ?? "Novo formulário"} description="Uma pergunta por tela, igual ao Yay! Forms. Salve e abra o link para conferir." />
      <EditorFormulario
        inicial={form ? { id: form.id, slug: form.slug, nome: form.nome, ativo: form.ativo, responsavel_padrao: form.responsavel_padrao, config: form.config } : { id: null, slug: "", nome: "", ativo: true, responsavel_padrao: null, config: CONFIG_VAZIA }}
        equipe={equipe}
        podeExcluir={permissoes.excluir}
        site={process.env.NEXT_PUBLIC_SITE_URL ?? "https://mcadvogados.app.br"}
      />
    </div>
  );
}
