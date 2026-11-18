import { Lock } from "lucide-react";
import { demandasVencidas, equipeDe, lerRelatorio, modeloDaPessoa } from "@/lib/rotina-relatorio/dados";
import type { Pendencia } from "@/lib/rotina-relatorio/bloqueio";
import { RelatorioDoDia } from "./relatorio-do-dia";

// Tela que toma o lugar do portal enquanto o relatório do dia anterior não for enviado
// (18/11/2026, pedido do Maurício). Ao enviar, o layout recarrega e o portal volta.

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export async function BloqueioRelatorio({ pendencia }: { pendencia: Pendencia }) {
  const { responsavelId, dia, advertenciasNoMes } = pendencia;
  const [modelo, equipe, demandas, rel] = await Promise.all([modeloDaPessoa(responsavelId), equipeDe(responsavelId), demandasVencidas(responsavelId, dia), lerRelatorio(responsavelId, dia)]);
  if (!modelo) return null;
  const usaEquipe = modelo.perguntas.some((q) => q.ativa && q.secao === "equipe_pessoa");
  const nomeDia = `${DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()]}, ${dia.split("-").reverse().join("/")}`;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section role="alert" className="ui-card !border-status-danger/40 bg-status-danger-bg/40 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-status-danger text-white">
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-foreground">Falta o relatório de {nomeDia}</h1>
            <p className="mt-1 text-sm text-foreground/80">
              O portal fica bloqueado até você enviar o relatório desse dia. Preencha abaixo e clique em Enviar: o portal libera na hora.
            </p>
            <p className="mt-2 text-sm font-semibold text-status-danger">
              Advertência registrada neste mês{advertenciasNoMes > 1 ? `: ${advertenciasNoMes} no total` : ""}.
            </p>
          </div>
        </div>
      </section>
      <div className="ui-card p-5 sm:p-6">
        <RelatorioDoDia
          key={dia}
          pendente={dia}
          perguntas={modelo.perguntas.filter((q) => q.ativa).map((q) => ({ id: q.id, secao: q.secao, texto: q.texto, tipo: q.tipo, opcoes: q.opcoes, obrigatoria: q.obrigatoria }))}
          equipe={usaEquipe ? equipe : []}
          demandas={demandas}
          inicial={{ respostas: rel?.respostas ?? {}, justificativas: rel?.justificativas ?? {}, enviadoEm: null }}
        />
      </div>
    </div>
  );
}
