import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/dal";
import { getClient } from "@/lib/data/clients";
import { getHandoff } from "@/lib/data/handoff";
import { PageHeader } from "@/components/ui/page-header";
import type { HandoffAnswers } from "@/lib/handoff-schema";
import { HandoffForm } from "./handoff-form";

export default async function HandoffPage({ params }: { params: Promise<{ id: string }> }) {
  await exigirPermissao("clientes", "ficha_handoff");
  const { id } = await params;
  const [client, ficha] = await Promise.all([getClient(id), getHandoff(id)]);
  if (!client) notFound();

  const salvo = (ficha.handoff ?? {}) as HandoffAnswers;
  // primeira vez: já traz o que o cadastro sabe
  const inicial: HandoffAnswers = Object.keys(salvo).length
    ? salvo
    : {
        empresa: client.name,
        email: client.email_contact,
        ...(client.tipo_pessoa === "PJ" && !client.documento.startsWith("PENDENTE") ? { cnpj: client.documento } : {}),
      };

  return (
    <div>
      <PageHeader
        title="Ficha de Handoff"
        description={`Comercial → Jurídico · ${client.name}`}
        back={{ href: `/admin/clients/${client.id}`, label: "Voltar ao cliente" }}
      />
      <HandoffForm clientId={client.id} inicial={inicial} />
    </div>
  );
}
