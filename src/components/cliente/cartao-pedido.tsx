import { Avatar } from "@/components/ui/avatar";
import { EtapasPedido } from "@/components/cliente/etapas-pedido";
import { prazoRelativo, type AtividadeCliente } from "@/lib/data/portal-cliente";

// Pedido aberto pelo cliente: o que pediu, quando, quem pegou e a etapa.
export function CartaoPedido({ p }: { p: AtividadeCliente }) {
  const prazo = p.etapa === "concluido" ? null : prazoRelativo(p.deadline);
  return (
    <li className="ui-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">Enviado em {new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</p>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-foreground">{p.title}</p>
          {/* só o que ele escreveu/falou; as notas de anexo/áudio vêm depois, em outro parágrafo */}
          {p.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{p.description.split("\n\n")[0]}</p>}
        </div>
        {p.pessoa && (
          <span className="flex shrink-0 items-center gap-2" title={`Com ${p.pessoa.nome}`}>
            <Avatar nome={p.pessoa.nome} foto={p.pessoa.foto} tamanho={30} />
          </span>
        )}
      </div>
      <div className="mt-4">
        <EtapasPedido etapa={p.etapa} />
      </div>
      <p className="mt-3 text-xs text-muted">
        {p.etapa === "enviado" && "O escritório vai analisar e definir quem cuida do seu pedido."}
        {p.etapa === "recebido" && `${p.pessoa ? `${p.pessoa.nome} vai cuidar` : "Já tem responsável"}${prazo ? ` · ${prazo.texto}` : ""}.`}
        {p.etapa === "andamento" && `${p.pessoa ? `${p.pessoa.nome} está trabalhando nisso` : "Em andamento"}${prazo ? ` · ${prazo.texto}` : ""}.`}
        {p.etapa === "concluido" && `Concluído em ${new Date(p.concluida_em ?? p.updated_at).toLocaleDateString("pt-BR")}.`}
      </p>
    </li>
  );
}
