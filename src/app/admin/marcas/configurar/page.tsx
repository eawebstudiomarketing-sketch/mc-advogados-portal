import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/lib/dal";
import { getMarca, nomeDaMarca } from "@/lib/marcas/dados";
import { listClients } from "@/lib/data/clients";
import { FormConfigurar } from "./form-configurar";

// Marcas → Configurar acompanhamento (mesma tela do Marca Acompanhada):
// avisos do processo, colidência e o cliente/contato do WhatsApp.

export default async function ConfigurarMarcaPage({ searchParams }: { searchParams: Promise<{ processo?: string }> }) {
  await exigirPermissao("marcas");
  const { processo } = await searchParams;
  if (!processo) notFound();
  const [r, clientes] = await Promise.all([getMarca(processo), listClients()]);
  if (!r) notFound();
  const m = r.marca;
  const nome = nomeDaMarca(m);
  // termos da marca (cada palavra ganha um peso na colidência)
  const termos = [...new Set((m.nome ?? "").toUpperCase().split(/[^A-Z0-9À-Ú]+/).filter((t) => t.length >= 2))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Marcas · {nome}</p>
          <h1 className="page-title">Configurar acompanhamento</h1>
          <p className="text-sm text-muted">Ajuste os alertas e associe este processo a um cliente.</p>
        </div>
        <Link href={`/admin/marcas/processos/${m.processo}`} className="ui-btn-secondary">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar
        </Link>
      </div>
      <FormConfigurar
        processo={m.processo}
        nome={nome}
        termos={termos}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.name }))}
        inicial={{
          avisar_cliente: m.avisar_cliente,
          colidencia: m.colidencia,
          colid_auto: m.colid_auto,
          colid_escopo: m.colid_escopo,
          colid_sensibilidade: m.colid_sensibilidade,
          colid_termos: m.colid_termos ?? {},
          colid_extras: m.colid_extras ?? [],
          colid_ignorar: m.colid_ignorar ?? [],
          apelido: m.apelido,
          client_id: m.client_id,
          contato_nome: m.contato_nome,
          contato_numero: m.contato_numero,
          observacao: m.observacao,
        }}
      />
    </div>
  );
}
