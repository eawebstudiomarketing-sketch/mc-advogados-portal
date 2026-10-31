import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Respostas, Secao } from "@/lib/regimentos/tipos";
import { FormularioPublico } from "./formulario-publico";

// Página pública do Regimento Interno (sem login): a empresa abre o link,
// responde seção por seção (como no Google Forms) e envia.

export const metadata: Metadata = { title: "Regimento Interno · MC Advogados", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function RegimentoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const { data } = await (createAdminClient() as unknown as SupabaseClient)
    .from("regimentos")
    .select("titulo, descricao, secoes, aceitando, status, rascunho_respostas")
    .eq("token", token)
    .maybeSingle();
  if (!data) notFound();
  return (
    <FormularioPublico
      token={token}
      titulo={data.titulo as string}
      descricao={(data.descricao as string | null) ?? ""}
      secoes={data.secoes as Secao[]}
      inicial={(data.rascunho_respostas as Respostas) ?? {}}
      fechado={!data.aceitando}
      jaEnviado={data.status === "respondido"}
    />
  );
}
