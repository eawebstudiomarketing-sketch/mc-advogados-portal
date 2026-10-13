"use client";

import { ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { deleteDocumentAction } from "@/app/admin/documents/actions";

export type AtaItem = {
  id: string;
  title: string;
  meeting_date: string | null;
  created_at: string;
  downloadUrl: string | null;
};

const dataBR = (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("pt-BR");

// ATAs de reunião do cliente. Internas: o cliente não vê no portal dele.
// Servem de base para a geração de demandas.
export function AtasCard({ clientId, atas }: { clientId: string; atas: AtaItem[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/atas/upload", { method: "POST", body: new FormData(e.currentTarget) });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível enviar a ATA. Tente novamente.");
        return;
      }
      formRef.current?.reset();
      setAberto(false);
      toast.success("ATA salva");
      router.refresh();
    } catch {
      setError("Não foi possível enviar a ATA. Tente novamente.");
    } finally {
      setPending(false);
    }
  }

  const campo =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy";

  return (
    <div className="ui-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="section-title">
            ATAs <span className="font-normal text-muted">({atas.length})</span>
          </h2>
          <p className="text-xs text-muted">Atas das reuniões com o cliente. Uso interno: o cliente não vê.</p>
        </div>
        {!aberto && (
          <button type="button" onClick={() => setAberto(true)} className="ui-link">
            + Adicionar ATA
          </button>
        )}
      </div>

      {aberto && (
        <form ref={formRef} onSubmit={enviar} className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-background/50 p-4 sm:grid-cols-[1fr_170px]">
          <input type="hidden" name="client_id" value={clientId} />
          <div>
            <label htmlFor="ata-title" className="mb-1 block text-xs font-medium text-foreground/70">
              Título
            </label>
            <input id="ata-title" name="title" required placeholder="Ex.: Reunião mensal de outubro" className={campo} />
          </div>
          <div>
            <label htmlFor="ata-date" className="mb-1 block text-xs font-medium text-foreground/70">
              Data da reunião
            </label>
            <input id="ata-date" name="meeting_date" type="date" className={campo} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="ata-file" className="mb-1 block text-xs font-medium text-foreground/70">
              Arquivo (PDF, Word, texto ou imagem)
            </label>
            <input
              id="ata-file"
              name="file"
              type="file"
              required
              accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp"
              className="block w-full text-sm text-foreground/70 file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-navy-foreground"
            />
          </div>
          {error && <p className="text-sm text-status-danger sm:col-span-2">{error}</p>}
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="ui-btn px-3 py-1.5 text-xs"
            >
              {pending ? "Enviando..." : "Salvar ATA"}
            </button>
            <button type="button" onClick={() => setAberto(false)} className="text-xs font-medium text-muted hover:underline">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <ul className="mt-3 divide-y divide-border">
        {atas.length === 0 && <p className="py-3 text-sm text-muted">Nenhuma ATA anexada.</p>}
        {atas.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2">
            <div>
              <p className="text-sm text-foreground">{a.title}</p>
              <p className="text-xs text-muted">
                {a.meeting_date ? `Reunião em ${dataBR(a.meeting_date)}` : `Enviada em ${dataBR(a.created_at)}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {a.downloadUrl && (
                <a href={a.downloadUrl} target="_blank" rel="noreferrer" className="icon-btn" aria-label="Abrir" data-tip="Abrir"><ExternalLink aria-hidden /></a>
              )}
              <ConfirmSubmitButton
                action={deleteDocumentAction}
                hiddenFields={{ id: a.id, client_id: clientId }}
                confirmMessage={`Excluir a ATA "${a.title}"? Ela vai para a lixeira (30 dias).`}
                label="Excluir"
                icon="trash"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
