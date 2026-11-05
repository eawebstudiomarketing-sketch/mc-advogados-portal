import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { RelatorioLeitura } from "@/components/rotina/relatorio-leitura";
import { coletarDia } from "@/lib/rotina-relatorio/dia";
import { hojeBahia } from "@/lib/rotina-relatorio/dados";
import { listPessoas } from "@/lib/data/escritorio";

// Aba "Rotinas" do Painel do Dono: o relatório do dia de cada pessoa, ao lado
// das rotinas fixas e das demandas (concluídas e vencidas). Só o admin máximo
// chega aqui (a página do painel já exige isso).

const dataBr = (dia: string) => dia.split("-").reverse().join("/");
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit" });

export async function RotinasDoDia({ dia: pedido }: { dia?: string }) {
  const hoje = hojeBahia();
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(pedido ?? "") && pedido! <= hoje ? pedido! : hoje;
  const [pessoas, fotos] = await Promise.all([coletarDia(dia), listPessoas()]);
  const foto = new Map(fotos.map((p) => [p.id, p.foto]));
  const comModelo = pessoas.filter((p) => p.temModelo);
  const enviados = comModelo.filter((p) => p.relatorio?.status === "enviado").length;
  const vencidas = pessoas.reduce((n, p) => n + p.vencidas.length, 0);
  const concluidas = pessoas.reduce((n, p) => n + p.concluidas.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="section-title">Rotinas de {dataBr(dia)}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {enviados} de {comModelo.length} relatórios enviados · {concluidas} demandas concluídas · {vencidas} vencidas em aberto
            {dia === hoje ? " · a equipe envia até as 18:00 e o Maurício até as 23:59" : ""}
          </p>
        </div>
        <form method="get" className="flex items-center gap-1.5">
          <input type="hidden" name="aba" value="rotinas" />
          <input type="date" name="dia" defaultValue={dia} max={hoje} className="ui-input !w-auto !py-1.5 text-sm" aria-label="Dia" />
          <button type="submit" className="ui-btn-secondary px-3 py-1.5 text-xs">
            Ver
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {pessoas.map((p) => {
          const enviado = p.relatorio?.status === "enviado";
          const fixasFeitas = p.fixas.filter((f) => f.feito).length;
          return (
            <article key={p.id} className="ui-card p-4">
              <div className="flex items-center gap-2.5">
                <Avatar nome={p.nome} foto={foto.get(p.id) ?? null} tamanho={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{p.nome}</p>
                  <p className="text-xs">
                    {!p.temModelo ? (
                      <span className="text-muted">Sem relatório (nenhum modelo)</span>
                    ) : enviado ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-status-success">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Enviado às {hora(p.relatorio!.enviado_em!)}
                      </span>
                    ) : p.relatorio ? (
                      <span className="inline-flex items-center gap-1 text-status-pending">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> Em rascunho
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 ${dia < hoje ? "font-semibold text-status-danger" : "text-muted"}`}>
                        <XCircle className="h-3.5 w-3.5" aria-hidden /> {dia < hoje ? "Não enviou" : "Ainda não enviou"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right text-xs tabular-nums text-muted">
                  {p.fixas.length > 0 && (
                    <p>
                      Fixas <b className="text-foreground">{fixasFeitas}/{p.fixas.length}</b>
                    </p>
                  )}
                  <p>
                    Concluídas <b className="text-foreground">{p.concluidas.length}</b>
                  </p>
                  <p className={p.vencidas.length ? "text-status-danger" : ""}>
                    Vencidas <b>{p.vencidas.length}</b>
                  </p>
                </div>
              </div>
              {enviado && (
                <details className="mt-3 border-t border-border pt-2.5">
                  <summary className="cursor-pointer text-sm font-medium text-foreground/80 hover:underline">Ler relatório</summary>
                  <div className="mt-3">
                    <RelatorioLeitura relatorio={p.relatorio!} />
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        Para montar as perguntas e escolher quem responde, abra <Link href="/admin/rotinas" className="underline">Operacional › Rotinas</Link>.
      </p>
    </div>
  );
}
