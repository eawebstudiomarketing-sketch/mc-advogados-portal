"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DOCUMENT_CATEGORY_LABEL, DOCUMENT_CATEGORIES } from "@/lib/document-category";
import type { Client } from "@/lib/data/clients";

export function DocumentForm({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      router.push("/admin/documents");
      router.refresh();
    } catch {
      setError("Não foi possível enviar o documento. Tente novamente.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <div>
        <label htmlFor="client_id" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Cliente
        </label>
        <select
          id="client_id"
          name="client_id"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-foreground/80">
          Título
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
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
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
        >
          {DOCUMENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {DOCUMENT_CATEGORY_LABEL[cat]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="file" className="mb-1.5 block text-sm font-medium text-foreground/80">
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
        className="w-full rounded-lg bg-navy px-4 py-2.5 text-sm font-medium text-navy-foreground transition-colors hover:bg-navy/90 disabled:opacity-60"
      >
        {pending ? "Enviando..." : "Enviar documento"}
      </button>
    </form>
  );
}
