import Link from "next/link";
import { formatarDocumento, formatarTelefone } from "@/lib/formatar";
import { Pencil } from "lucide-react";
import type { Client } from "@/lib/data/clients";
import type { ContaPF, EnderecoPF } from "@/components/cliente/campos-pf";

// Aba "Cadastro" do cliente pessoa física, nas mesmas seções do Astrea.

const dataBR = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : null);

function Linhas({ titulo, itens }: { titulo: string; itens: [string, string | null | undefined][] }) {
  return (
    <section className="border-b border-border py-5 last:border-b-0">
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{titulo}</h3>
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
        {itens.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="text-[13px] text-muted sm:text-right">{rotulo}</dt>
            <dd className={`text-sm ${valor ? "text-foreground" : "text-muted/60"}`}>{valor || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CadastroPF({ c, podeEditar }: { c: Client; podeEditar: boolean }) {
  const e = (c.endereco ?? {}) as EnderecoPF;
  const conta = (c.conta_bancaria ?? {}) as ContaPF;
  const endereco = [[e.logradouro, e.numero].filter(Boolean).join(", "), e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join("/"), e.cep && `CEP ${e.cep}`].filter(Boolean).join(" - ");
  return (
    <div className="ui-card px-6 py-2">
      <div className="flex items-center justify-between border-b border-border py-4">
        <p className="text-sm text-muted">
          Criado em {new Date(c.created_at).toLocaleDateString("pt-BR")}
          {c.astrea_contato_id && <span> · veio do Astrea</span>}
          {c.falecido && <span className="ml-2 rounded bg-surface-2 px-1.5 py-px text-[11px] font-semibold text-foreground/70 uppercase">Falecido{c.data_obito ? ` em ${dataBR(c.data_obito)}` : ""}</span>}
        </p>
        {podeEditar && (
          <Link href={`/admin/clients/${c.id}/edit`} className="ui-btn-secondary">
            <Pencil className="h-4 w-4" aria-hidden /> Editar cadastro
          </Link>
        )}
      </div>
      <Linhas
        titulo="Dados pessoais"
        itens={[
          ["Nome", c.name],
          ["Apelido", c.apelido],
          ["Nascimento", dataBR(c.nascimento)],
          ["Estado civil", c.estado_civil],
          ["Profissão", c.profissao],
        ]}
      />
      <Linhas
        titulo="Contato"
        itens={[
          ["Telefone(s)", (c.telefones ?? []).map(formatarTelefone).join(" · ")],
          ["E-mail", c.email_contact],
          ["Endereço", endereco],
        ]}
      />
      <Linhas
        titulo="Documentos"
        itens={[
          ["CPF", formatarDocumento(c.documento)],
          ["RG", c.rg],
          ["CTPS", c.ctps],
          ["PIS", c.pis],
          ["Título de eleitor", c.titulo_eleitor],
          ["CNH", c.cnh],
          ["Passaporte", c.passaporte],
          ["Certidão reservista", c.reservista],
        ]}
      />
      <Linhas
        titulo="Outros dados"
        itens={[
          ["Nome do pai", c.nome_pai],
          ["Nome da mãe", c.nome_mae],
          ["Naturalidade", c.naturalidade],
          ["Nacionalidade", c.nacionalidade],
          ["Comentários", c.comentarios],
        ]}
      />
      <Linhas
        titulo="Conta bancária"
        itens={[
          ["Banco", conta.banco],
          ["Agência", conta.agencia],
          ["Conta", conta.conta],
          ["Chave PIX", conta.pix],
        ]}
      />
    </div>
  );
}
