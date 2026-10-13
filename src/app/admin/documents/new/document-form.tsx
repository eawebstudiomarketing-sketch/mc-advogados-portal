"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DOCUMENT_CATEGORY_LABEL, DOCUMENT_CATEGORIES } from "@/lib/document-category";
import type { Client } from "@/lib/data/clients";
import { telaAnterior } from "@/lib/navegacao";

export function DocumentForm({
  clients,
  activityId,
  processId,
  clientId,
  scopeLabel,
  returnTo,
}: {
  clients: Client[];
  activityId?: string;
  processId?: string;
  clientId?: string;
  scopeLabel?: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const scoped = Boolean(activityId || processId);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: new FormData(e.currentTarget),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível enviar o documento. Tente novamente.");
        return;
      }
      router.push(telaAnterior(pathname) ?? returnTo ?? "/admin/documents");
      router.refresh();
    } catch {
      setError("Não foi possível enviar o documento. Tente novamente.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-5 ui-card p-6">
      {activityId && <input type="hidden" name="activity_id" value={activityId} />}
      {processId && <input type="hidden" name="process_id" value={processId} />}

      {scoped ? (
        <div>
          <p className="ui-label">Cliente</p>
          <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground/70">
            {scopeLabel ?? "Definido automaticamente"}
          </p>
        </div>
      ) : (
        <div>
          <label htmlFor="client_id" className="ui-label">
            Cliente
          </label>
          <select
            id="client_id"
            name="client_id"
            defaultValue={clientId}
            className="ui-input"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="title" className="ui-label">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          className="ui-input"
        />
      </div>

      <div>
        <label htmlFor="category" className="ui-label">
          Categoria
        </label>
        <select
          id="category"
          name="category"
          className="ui-input"
        >
          {DOCUMENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {DOCUMENT_CATEGORY_LABEL[cat]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="file" className="ui-label">
          Arquivo
        </label>
        <input
          id="file"
          name="file"
          type="file"
          required
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-navy-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      {error && <p className="text-sm text-status-danger">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Enviando..." : "Enviar documento"}
      </button>
    </form>
  );
}
