import { redirect } from "next/navigation";

// O pedido do cliente agora fica em /dashboard/pedidos/novo (formulário simples, com anexo e urgência).
export default function NewOwnActivityPage() {
  redirect("/dashboard/pedidos/novo");
}
