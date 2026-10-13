"use client";

import { useEffect, useState } from "react";

export type PickedFolder = { id: string; name: string };

const btn = "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-navy hover:bg-background disabled:opacity-50";

// Escolher UMA pasta do Drive: navegar pelas pastas, buscar pelo nome ou olhar
// os "compartilhados comigo". Só admin (a rota /api/drive/browse exige).
export function FolderPicker({ onPick, onClose }: { onPick: (f: PickedFolder) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"drive" | "shared">("drive");
  const [crumbs, setCrumbs] = useState<PickedFolder[]>([]);
  const [search, setSearch] = useState("");
  const [folders, setFolders] = useState<PickedFolder[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(q = search) {
    setBusy(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim().length >= 2) qs.set("q", q.trim());
      else if (mode === "shared" && crumbs.length === 0) qs.set("shared", "1");
      else if (crumbs.length > 0) qs.set("parent", crumbs[crumbs.length - 1].id);
      const res = await fetch(`/api/drive/browse?${qs}`);
      const body = (await res.json().catch(() => ({}))) as { folders?: PickedFolder[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Não foi possível listar as pastas.");
      setFolders(body.folders ?? []);
    } catch (e) {
      setError((e as Error).message);
      setFolders([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(""), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, crumbs]);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => { setMode("drive"); setCrumbs([]); setSearch(""); }}>
          Meu Drive
        </button>
        <button type="button" className={btn} onClick={() => { setMode("shared"); setCrumbs([]); setSearch(""); }}>
          Compartilhados comigo
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Buscar pasta pelo nome"
          className="min-w-[200px] flex-1 rounded-lg border border-border bg-surface px-3 py-1.5"
        />
        <button type="button" className={btn} disabled={busy} onClick={() => load()}>
          Buscar
        </button>
        <button type="button" className="text-muted underline" onClick={onClose}>
          Cancelar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-muted">
        <button type="button" className="underline" onClick={() => { setCrumbs([]); setSearch(""); load(""); }}>
          {mode === "shared" ? "Compartilhados" : "Meu Drive"}
        </button>
        {crumbs.map((c, i) => (
          <span key={c.id}>
            {" / "}
            <button type="button" className="underline" onClick={() => setCrumbs(crumbs.slice(0, i + 1))}>
              {c.name}
            </button>
          </span>
        ))}
      </div>

      {error && <p className="text-status-danger">{error}</p>}
      {busy && folders === null && <p className="text-muted">Carregando pastas...</p>}
      {folders && (
        <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface">
          {folders.length === 0 && !error && <li className="px-3 py-3 text-muted">Nenhuma pasta aqui.</li>}
          {folders.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 hover:bg-background">
              <span className="flex-1">{f.name}</span>
              <button type="button" className="text-navy underline" onClick={() => { setSearch(""); setCrumbs([...crumbs, f]); }}>
                abrir ▸
              </button>
              <button type="button" className="ui-btn" onClick={() => onPick(f)}>
                Escolher esta
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
