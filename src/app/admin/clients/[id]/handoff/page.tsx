import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/dal";
import { getClient } from "@/lib/data/clients";
import { getHandoff } from "@/lib/data/handoff";
import { PageHeader } from "@/components/ui/page-header";
import type { HandoffAnswers } from "@/lib/handoff-schema";
import { HandoffForm } from "./handoff-form";
import { formatarDocumento, formatarTelefone } from "@/lib/formatar";

export default async function HandoffPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("clientes", "ficha_handoff");
  const { id } = await params;
  const [client, ficha] = await Promise.all([getClient(id), getHandoff(id)]);
  if (!client) notFound();

  const salvo = (ficha.handoff ?? {}) as HandoffAnswers;
  // primeira vez: já traz o que o cadastro sabe
  const inicial: HandoffAnswers = Object.keys(salvo).length
    ? salvo
    : client.tipo_pessoa === "PF"
      ? (Object.fromEntries(
          Object.entries({
            pf_nome: client.name,
            pf_cpf: formatarDocumento(client.documento),
            pf_rg: client.rg,
            pf_nascimento: client.nascimento,
            pf_estado_civil: client.estado_civil,
            pf_profissao: client.profissao,
            pf_telefone: formatarTelefone(client.telefones?.[0]),
            pf_email: client.email_contact,
            pf_endereco: client.endereco
              ? (() => {
                  const e = client.endereco as Record<string, string>;
                  return [[e.logradouro, e.numero].filter(Boolean).join(", "), e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join("/"), e.cep && `CEP ${e.cep}`].filter(Boolean).join(" - ");
                })()
              : null,
          }).filter(([, v]) => v)
        ) as HandoffAnswers)
      : {
          empresa: client.name,
          ...(client.email_contact ? { email: client.email_contact } : {}),
          ...(client.documento && !client.documento.startsWith("PENDENTE") ? { cnpj: client.documento } : {}),
        };

  return (
    <div>
      <PageHeader
        title="Ficha de Handoff"
        description={`Comercial → Jurídico · ${client.name}`}
        back={{ href: `/admin/clients/${client.id}`, label: "Voltar ao cliente" }}
      />
      <HandoffForm clientId={client.id} inicial={inicial} tipo={client.tipo_pessoa} />
    </div>
  );
}
