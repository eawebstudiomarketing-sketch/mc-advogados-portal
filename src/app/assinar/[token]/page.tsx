import type { Metadata } from "next";
import { abrirPorToken, type AssinaturaRow } from "@/lib/atas/assinatura";
import { blocosDaAta, blocosParaCliente, dataHoraBr, TIPOS_ATA } from "@/lib/atas/formato";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AssinarApp, type EstadoPagina } from "./assinar-app";

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
  if (a.status === "recusada") return <Aviso titulo="Assinatura recusada" texto="Você recusou assinar esta ata. O escritório foi avisado do motivo." />;
  if (a.status === "pendente" && p.vencido) return <Aviso titulo="Prazo vencido" texto="O prazo para assinar esta ata venceu. Peça um novo link ao escritório." />;

  const { data: outras } = await (createAdminClient() as unknown as SupabaseClient)
    .from("ata_assinaturas")
    .select("nome, status, observador, ordem")
    .eq("ata_id", ata.id)
    .eq("versao", a.versao)
    .neq("status", "cancelada")
    .order("ordem")
    .order("created_at");
  const blocos = TIPOS_ATA[ata.tipo].assinaCliente ? blocosParaCliente(blocosDaAta(ata.texto)) : blocosDaAta(ata.texto);
  const concluida = ata.status === "assinada" && atual;
  const estado: EstadoPagina = concluida
    ? "concluida"
    : a.observador
      ? "observador"
      : a.status === "assinada"
        ? "assinei"
        : a.tentativas >= 5
          ? "travada"
          : !p.daVez
            ? "aguardando_vez"
            : "pendente";
  const mascara = (t: string) => `(${t.slice(2, 4)}) •••••-${t.slice(-4)}`;
  const linhas = (outras ?? []) as Pick<AssinaturaRow, "nome" | "status" | "observador" | "ordem">[];
  return (
    <AssinarApp
      token={token}
      nome={a.nome}
      dados={dados}
      blocos={blocos}
      estado={estado}
      assineiEm={a.assinado_em ? dataHoraBr(a.assinado_em) : null}
      prazo={a.expira_em ? dataHoraBr(a.expira_em) : null}
      exige={{ selfie: !!a.exige?.selfie, documento: !!a.exige?.documento, certificado: !!a.exige?.certificado }}
      feito={{ assinatura: !!a.assinatura_path, selfie: !!a.selfie_path, documento: !!a.documento_paths, certificado: !!a.certificado }}
      canais={{ zap: a.telefone ? mascara(a.telefone) : null, email: a.email ? a.email.replace(/^(.)(.*)(@.*)$/, (_, x: string, m: string, d: string) => `${x}${"•".repeat(Math.min(6, m.length))}${d}`) : null }}
      signatarios={linhas.filter((o) => !o.observador).map((o) => ({ nome: o.nome, assinou: o.status === "assinada" }))}
      ordem={ata.ordem_assinatura}
      hash={ata.pdf_hash}
      codigo={ata.codigo_validacao}
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
