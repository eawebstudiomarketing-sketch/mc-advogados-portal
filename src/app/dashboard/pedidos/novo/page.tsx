import { requireRole } from "@/lib/dal";
import { BackButton } from "@/components/nav/back-button";
import { FormPedido } from "./form-pedido";

export default async function NovoPedidoPage() {
  await requireRole(["client"]);

  return (
    <div className="mx-auto max-w-2xl">
      <BackButton fallback="/dashboard/pedidos" />
      <p className="eyebrow mt-5">Novo pedido</p>
      <h1 className="page-title mt-2 !text-[2.2rem] !leading-[1.05]">
        Do que você precisa?
        <br />
        <span className="text-foreground/30">A gente cuida.</span>
      </h1>
      <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-foreground/70">
        Escreva com suas palavras. O escritório recebe na hora, define quem vai cuidar e você acompanha cada etapa em Pedidos.
      </p>
      <FormPedido />
    </div>
  );
}
