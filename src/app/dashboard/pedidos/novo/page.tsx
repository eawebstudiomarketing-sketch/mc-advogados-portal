import { requireRole } from "@/lib/dal";
import { BackButton } from "@/components/nav/back-button";
import { FormPedido } from "./form-pedido";

export default async function NovoPedidoPage({ searchParams }: { searchParams: Promise<{ processo?: string }> }) {
  await requireRole(["client"]);
  // "Falar com o escritório sobre este processo" (12/11/2026): já vem com o número
  const processo = ((await searchParams).processo ?? "").replace(/[^\d.\-]/g, "").slice(0, 30);

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
      <FormPedido tituloInicial={processo ? `Sobre o processo ${processo}` : ""} />
    </div>
  );
}
