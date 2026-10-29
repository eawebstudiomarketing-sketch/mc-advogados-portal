import Link from "next/link";
import { AlertTriangle, Bot, CircleCheck, CircleX, PauseCircle } from "lucide-react";
import { MOTIVO_TEXTO, type MotivoFalha } from "@/lib/robos/saude";

// Saúde dos robôs (29/10/2026): cards no topo de Alertas quando algum robô falha e a aba "Robôs"
// com a situação de todos (verde = lendo normal, amarelo = falhou e está tentando de novo,
// vermelho = fora do ar / sem sinal; o e-mail de alerta sai no vermelho).

export type RoboTela = {
  robo: string;
  nome: string;
  grupo: string;
  status: "ok" | "atencao" | "fora" | "pausado";
  motivo: string | null;
  detalhe: string | null;
  usando_reserva: boolean;
  falhas_seguidas: number;
  ultima_ok: string | null;
  ultima_tentativa: string | null;
  desde: string;
};

const hora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" }) : "nunca";
const motivo = (m: string | null) => (m ? (MOTIVO_TEXTO[m as MotivoFalha] ?? m) : "motivo não identificado");
const GRUPO: Record<string, string> = { andamentos: "Andamentos", publicacoes: "Publicações", integracoes: "Integrações" };

/** Cards de alerta (só aparecem quando há robô com problema). */
export function CardsRobos({ robos }: { robos: RoboTela[] }) {
  if (!robos.length) return null;
  return (
    <div className="mb-5 space-y-2" role="status" aria-live="polite">
      {robos.map((r) => {
        const fora = r.status === "fora";
        return (
          <div
            key={r.robo}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${fora ? "border-status-danger/30 bg-status-danger-bg" : "border-gold/30 bg-gold-soft"}`}
          >
            {fora ? <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-status-danger" aria-hidden /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-gold-ink" aria-hidden />}
            <div className="min-w-0 flex-1 text-sm">
              <p className={`font-medium ${fora ? "text-status-danger" : "text-gold-ink"}`}>
                {fora ? "Robô fora do ar" : "Robô com falha"}: {r.nome}
              </p>
              <p className="text-foreground/80">
                Desde {hora(r.desde)}: {motivo(r.motivo)}.{" "}
                {fora ? "Já foi enviado aviso por e-mail." : "Está tentando de novo sozinho."}
                {r.usando_reserva ? " A reserva está cobrindo enquanto isso." : ""} Última leitura com sucesso: {hora(r.ultima_ok)}.
              </p>
            </div>
            <Link href="/admin/alertas?aba=robos" className="shrink-0 text-xs font-medium text-navy-3 hover:underline">
              Ver robôs
            </Link>
          </div>
        );
      })}
    </div>
  );
}

const SELO = {
  ok: { texto: "Funcionando", cls: "bg-status-success-bg text-status-success", Icone: CircleCheck },
  atencao: { texto: "Com falha", cls: "bg-gold-soft text-gold-ink", Icone: AlertTriangle },
  fora: { texto: "Fora do ar", cls: "bg-status-danger-bg text-status-danger", Icone: CircleX },
  pausado: { texto: "Pausado", cls: "bg-surface-2 text-muted", Icone: PauseCircle },
} as const;

/** Aba "Robôs": todos os robôs, agrupados. */
export function TabelaRobos({ robos }: { robos: RoboTela[] }) {
  if (!robos.length) {
    return (
      <div className="ui-card flex items-center gap-3 px-5 py-8 text-sm text-muted">
        <Bot className="h-5 w-5" aria-hidden /> Nenhum robô registrou rodada ainda. Eles aparecem aqui na primeira leitura.
      </div>
    );
  }
  const grupos = [...new Set(robos.map((r) => r.grupo))];
  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <section key={g}>
          <h2 className="mb-2 text-[11px] font-medium tracking-wide text-muted uppercase">{GRUPO[g] ?? g}</h2>
          <div className="ui-card divide-y divide-border">
            {robos
              .filter((r) => r.grupo === g)
              .map((r) => {
                const s = SELO[r.status];
                return (
                  <div key={r.robo} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${s.cls}`}>
                      <s.Icone className="h-3.5 w-3.5" aria-hidden /> {s.texto}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{r.nome}</p>
                      <p className="text-xs text-muted">
                        Última leitura com sucesso: {hora(r.ultima_ok)} · última tentativa: {hora(r.ultima_tentativa)}
                        {r.status !== "ok" ? ` · ${motivo(r.motivo)}${r.falhas_seguidas > 1 ? ` (${r.falhas_seguidas} falhas seguidas)` : ""}` : ""}
                      </p>
                      {r.status !== "ok" && r.detalhe && <p className="mt-0.5 truncate text-xs text-foreground/70" title={r.detalhe}>{r.detalhe}</p>}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}
