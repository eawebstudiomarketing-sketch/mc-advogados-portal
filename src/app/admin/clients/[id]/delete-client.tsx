"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Trash2, TriangleAlert } from "lucide-react";
import { deleteClientAction, type DeleteClientState } from "../actions";

const initialState: DeleteClientState = { error: null };

// Botão "Excluir cliente" com confirmação forte: abre um painel que pede para
// digitar o nome do cliente antes de liberar a exclusão.
export function DeleteClient({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [state, formAction, pending] = useActionState(deleteClientAction, initialState);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confere = texto.trim().toLowerCase() === clientName.trim().toLowerCase();

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="icon-btn icon-btn-danger h-9 w-9 border border-border-strong bg-surface"
        aria-label="Excluir cliente"
        data-tip="Excluir cliente"
      >
        <Trash2 aria-hidden />
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => {
          setAberto(false);
          setTexto("");
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-surface p-0 text-foreground shadow-lg backdrop:bg-navy-2/50 backdrop:backdrop-blur-[2px]"
      >
        <form action={formAction} className="p-6">
          <input type="hidden" name="client_id" value={clientId} />
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-status-danger-bg text-status-danger">
              <TriangleAlert className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold">Excluir {clientName}?</h2>
              <p className="mt-1 text-sm text-muted">
                Some do portal junto com tudo dele: atividades, documentos, ATAs, contratos, onboardings, demandas e o acesso do cliente.
                Os documentos ficam 30 dias na Lixeira e os arquivos no Google Drive não são apagados.
              </p>
            </div>
          </div>

          <label htmlFor="confirmacao" className="ui-label mt-5">
            Digite <span className="font-semibold text-foreground">{clientName}</span> para confirmar
          </label>
          <input
            id="confirmacao"
            name="confirmacao"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            className="ui-input"
          />

          {state.error && <p className="mt-3 text-sm text-status-danger">{state.error}</p>}

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={() => setAberto(false)} className="ui-btn-secondary">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!confere || pending}
              className="ui-btn bg-status-danger hover:bg-status-danger/90 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {pending ? "Excluindo..." : "Excluir cliente"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
