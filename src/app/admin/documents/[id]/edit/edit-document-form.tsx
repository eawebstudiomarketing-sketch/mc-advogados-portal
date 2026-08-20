"use client";

import { useActionState } from "react";
import { updateDocumentAction, type UpdateDocumentState } from "../../actions";
import { DOCUMENT_CATEGORY_LABEL, DOCUMENT_CATEGORIES } from "@/lib/document-category";
import type { DocumentRow } from "@/lib/data/documents";

const initialState: UpdateDocumentState = { error: null };

export function EditDocumentForm({ document }: { document: DocumentRow }) {
  const [state, formAction, pending] = useActionState(updateDocumentAction, initialState);

  return (
    <form action={formAction} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <input type="hidden" name="id" value={document.id} />

      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={document.title}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        />
      </div>

      <div>
        <label htmlFor="category" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Categoria
        </label>
        <select
          id="category"
          name="category"
          defaultValue={document.category}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        >
          {DOCUMENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {DOCUMENT_CATEGORY_LABEL[cat]}
            </option>
          ))}
        </select>
      </div>

      {state.error && <p className="text-sm text-status-danger">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? "Salvando..." : "Salvar alterações"}
      </button>
    </form>
  );
}
