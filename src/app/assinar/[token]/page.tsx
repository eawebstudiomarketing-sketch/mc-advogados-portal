import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { abrirPorToken } from "@/lib/atas/assinatura";
import { blocosDaAta, blocosParaCliente, dataHoraBr, TIPOS_ATA } from "@/lib/atas/formato";
import { AssinarApp } from "./assinar-app";

export const metadata: Metadata = { title: "Assinatura da ata — MC Advogados", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Página pública de assinatura (sem login): o link pessoal leva o token.
export default async function AssinarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await abrirPorToken(token);
  if (!p) return <Aviso titulo="Link inválido" texto="Este link de assinatura não existe ou foi substituído por um mais novo. Se precisar, peça um novo link ao escritório." />;
  const { assinatura: a, ata, dados } = p;
  const atual = a.versao === ata.versao;
  if (a.status === "cancelada" || (!atual && a.status !== "assinada"))
    return <Aviso titulo="Este link não vale mais" texto="A ata foi atualizada depois que este link foi enviado. O escritório vai mandar o link da versão nova." />;
  if (a.status === "correcao") return <Aviso titulo="Correção pedida" texto="Recebemos o seu pedido de correção. O escritório vai revisar a ata e mandar a nova versão para assinatura." />;
  if (a.status === "pendente" && p.vencido)
    return <Aviso titulo="Link vencido" texto="Este link venceu. Peça um novo link ao escritório." />;

  const { data: outras } = await (createAdminClient() as unknown as SupabaseClient)
    .from("ata_assinaturas")
    .select("nome, status, assinado_em")
    .eq("ata_id", ata.id)
    .eq("versao", a.versao)
    .neq("status", "cancelada")
    .order("created_at");
  const blocos = TIPOS_ATA[ata.tipo].assinaCliente ? blocosParaCliente(blocosDaAta(ata.texto)) : blocosDaAta(ata.texto);
  const mascara = (t: string) => `(${t.slice(2, 4)}) •••••-${t.slice(-4)}`;
  return (
    <AssinarApp
      token={token}
      nome={a.nome}
      dados={dados}
      blocos={blocos}
      estado={a.status === "assinada" ? (ata.status === "assinada" && atual ? "concluida" : "assinei") : a.tentativas >= 5 ? "travada" : "pendente"}
      assineiEm={a.assinado_em ? dataHoraBr(a.assinado_em) : null}
      canais={{ zap: a.telefone ? mascara(a.telefone) : null, email: a.email ? a.email.replace(/^(.)(.*)(@.*)$/, (_, x: string, m: string, d: string) => `${x}${"•".repeat(Math.min(6, m.length))}${d}`) : null }}
      signatarios={(outras ?? []).map((o: { nome: string; status: string; assinado_em: string | null }) => ({ nome: o.nome, assinou: o.status === "assinada" }))}
      hash={ata.pdf_hash}
    />
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f2ee] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-black/5">
        <p className="text-[13px] font-bold tracking-wide text-[#1b1f24]">MC ADVOGADOS</p>
        <h1 className="mt-4 text-xl font-semibold text-[#1b1f24]">{titulo}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{texto}</p>
      </div>
    </main>
  );
}
