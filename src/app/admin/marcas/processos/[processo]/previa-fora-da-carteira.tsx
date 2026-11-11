import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { consultarBase, situacaoDoDespacho, type LinhaBase } from "@/lib/marcas/base";

// Processo que NÃO está na carteira (11/11/2026, pedido do usuário: "acho o
// processo na busca mas ele não abre no sistema"). Mostra a prévia com o que a
// base própria das revistas sabe dele e oferece pôr na carteira.

const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export async function PreviaForaDaCarteira({ processo }: { processo: string }) {
  let linha: LinhaBase | null = null;
  let erro: string | null = null;
  try {
    const r = await consultarBase("processo", processo, null, 5, 15_000);
    linha = r.resultados.find((x) => x.numero.replace(/\D/g, "") === processo) ?? r.resultados[0] ?? null;
  } catch (e) {
    erro = e instanceof Error ? e.message : "Não foi possível consultar a base de marcas.";
  }

  const campo = (rotulo: string, valor: React.ReactNode) => (
    <div className="border-b border-border py-2.5 text-sm last:border-b-0">
      <span className="text-muted">{rotulo}: </span>
      <span className="text-foreground">{valor || "—"}</span>
    </div>
  );

  return (
    <div className="space-y-5">
      <nav className="flex items-center gap-1.5 text-[13px] text-muted" aria-label="Caminho">
        <Link href="/admin/marcas" className="text-navy-3 hover:underline">
          Principal
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span>Processo {processo}</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-foreground">{linha?.marca ?? `Processo ${processo}`}</h1>
          <p className="mt-1 text-sm text-muted">Este processo não está na carteira do escritório. Abaixo, o que saiu dele nas revistas do INPI.</p>
        </div>
        <Link href={`/admin/marcas/cadastrar?processo=${processo}`} className="ui-btn">
          <Plus className="h-4 w-4" aria-hidden /> Acompanhar na carteira
        </Link>
      </div>

      <section className="ui-card p-5">
        {erro ? (
          <p className="text-sm text-status-danger">{erro}</p>
        ) : !linha ? (
          <p className="text-sm text-muted">
            Nenhuma publicação deste processo nas revistas desde 2017. Se o pedido é recente, ele ainda não foi publicado: dá para pôr na carteira mesmo assim, e os dados se completam quando sair na revista.
          </p>
        ) : (
          <div>
            {campo("Processo", <span className="font-mono">{linha.numero}</span>)}
            {campo("Marca", linha.marca)}
            {campo("Situação (pelo último despacho)", situacaoDoDespacho(linha.ultimo_despacho, linha.concessao))}
            {campo("Último despacho", linha.ultimo_despacho ? `${linha.ultimo_despacho}${linha.ultima_rpi ? ` · RPI ${linha.ultima_rpi}` : ""}${linha.ultima_data ? ` · ${dataBR(linha.ultima_data)}` : ""}` : null)}
            {campo("Apresentação / natureza", [linha.apresentacao, linha.natureza].filter(Boolean).join(" · "))}
            {campo("Classe", linha.classes)}
            {campo("Titular", [linha.titular, linha.uf].filter(Boolean).join(" / "))}
            {campo("Procurador", linha.procurador)}
            {campo("Depósito · concessão · vigência", `${dataBR(linha.deposito)} · ${dataBR(linha.concessao)} · ${dataBR(linha.vigencia)}`)}
            {linha.especificacao && campo("Especificação", <span className="whitespace-pre-wrap">{linha.especificacao}</span>)}
          </div>
        )}
      </section>
    </div>
  );
}
