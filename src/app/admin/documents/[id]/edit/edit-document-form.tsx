"use client";

import { useActionState } from "react";
import { updateDocumentAction, type UpdateDocumentState } from "../../actions";
import { DOCUMENT_CATEGORY_LABEL, DOCUMENT_CATEGORIES } from "@/lib/document-category";
import type { DocumentRow } from "@/lib/data/documents";
import { VoltarInput } from "@/components/nav/back-button";

const initialState: UpdateDocumentState = { error: null };

export function EditDocumentForm({ document }: { document: DocumentRow }) {
  const [state, formAction, pending] = useActionState(updateDocumentAction, initialState);

  return (
    <form action={formAction} className="max-w-xl space-y-5 ui-card p-6">
      <VoltarInput />
      <input type="hidden" name="id" value={document.id} />

      <div>
        <label htmlFor="title" className="ui-label">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          defaultValue={document.title}
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
          defaultValue={document.category}
          className="ui-input"
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
        className="ui-btn w-full py-2.5"
      >
        {pending ? "Salvando..." : "Salvar alterações"}
      </button>
    </form>
  );
}
