"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AiProgress } from "@/components/ui/ai-progress";

type Opcao = { id: string; titulo: string };

// Formulário de geração de demandas: o advogado escolhe a base (triagem,
// onboarding, ATAs, documento avulso) e pode dizer o foco. O Gemini gera
// rascunhos, revisados logo abaixo.
export function GerarDemandas({
  clientId,
  temTriagem,
  onboardings,
  atas,
  temRascunhos,
}: {
  clientId: string;
  temTriagem: boolean;
  onboardings: Opcao[];
  atas: Opcao[];
  temRascunhos: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function gerar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (temRascunhos && !confirm("Os rascunhos ainda não revisados serão substituídos pelos novos. Continuar?")) return;
    setPending(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/demandas/gerar", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível gerar as demandas. Tente novamente.");
        router.refresh();
        return;
      }
      setOk(`${data.generated} demandas geradas. Revise ao lado.`);
      toast.success(`${data.generated} demandas geradas`, { description: "Revise e aprove as que fizerem sentido." });
      const arquivo = formRef.current?.querySelector<HTMLInputElement>('input[type="file"]');
      if (arquivo) arquivo.value = "";
      router.refresh();
    } catch {
      setError("Não foi possível gerar as demandas. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  const caixa = "flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

  return (
    <form ref={formRef} onSubmit={gerar} className="mt-4 space-y-4">
      <input type="hidden" name="client_id" value={clientId} />

      <div>
        <p className="mb-2 text-xs font-medium text-muted">Gerar com base em</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={`${caixa} ${temTriagem ? "" : "opacity-50"}`}>
            <input type="checkbox" name="triagem" disabled={!temTriagem} defaultChecked={temTriagem} className="mt-0.5" />
            <span>
              Ficha de handoff
              {!temTriagem && <span className="block text-xs text-muted">Ainda não preenchida</span>}
            </span>
          </label>
          {onboardings.map((o) => (
            <label key={o.id} className={caixa}>
              <input type="checkbox" name="onboarding_ids" value={o.id} className="mt-0.5" />
              <span>{o.titulo}</span>
            </label>
          ))}
          {atas.map((a) => (
            <label key={a.id} className={caixa}>
              <input type="checkbox" name="ata_ids" value={a.id} className="mt-0.5" />
              <span>
                <span className="mr-1.5 rounded bg-navy/10 px-1.5 py-0.5 text-[10px] font-semibold text-navy">ATA</span>
                {a.titulo}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="demanda-arquivo" className="mb-1 block text-xs font-medium text-muted">
          Anexar um documento para esta geração <span className="font-normal text-muted">(opcional, fica salvo nos documentos do cliente)</span>
        </label>
        <input
          id="demanda-arquivo"
          name="file"
          type="file"
          accept=".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
          className="block w-full text-sm text-foreground/70 file:mr-3 file:rounded-lg file:border-0 file:bg-navy/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-navy"
        />
      </div>

      <div>
        <label htmlFor="demanda-foco" className="mb-1 block text-xs font-medium text-muted">
          O que você quer que a IA foque? <span className="font-normal text-muted">(opcional)</span>
        </label>
        <textarea
          id="demanda-foco"
          name="instructions"
          rows={2}
          placeholder="Ex.: só demandas trabalhistas; ou: o que precisa ser feito antes da abertura da nova unidade"
          className="ui-input"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="ui-btn px-3 py-1.5 text-xs"
        >
          {pending ? "O Gemini está analisando..." : "Gerar demandas"}
        </button>

        {ok && <span className="text-xs text-status-success">{ok}</span>}
      </div>
      {error && <p className="text-sm text-status-danger">{error}</p>}
      {pending && (
        <AiProgress
          titulo="O Gemini está analisando o material"
          etapas={["Lendo as fontes escolhidas", "Cruzando com as atividades em aberto", "Escrevendo as demandas", "Definindo prioridade e prazo"]}
        />
      )}
    </form>
  );
}
