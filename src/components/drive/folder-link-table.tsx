"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPicker, type PickedFolder } from "./folder-picker";

export type ClientRowData = {
  id: string;
  name: string;
  linked: { id: string; name: string }[];
  driveDocs: number;
  lastSync: string | null;
};
type Suggestion = { clientId: string; folderId: string; folderName: string; score: number };
type Msg = { text: string; ok: boolean; undoBatch?: string };

const btn = "rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-navy hover:bg-background disabled:opacity-50";
const btnPrimary = "rounded-lg bg-navy px-3 py-1.5 text-xs font-medium text-navy-foreground hover:opacity-90 disabled:opacity-50";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(j.error ?? "Não foi possível concluir. Tente novamente.");
  return j;
}

type SyncOut = { imported: number; exported: number };
const summary = (r: SyncOut) =>
  r.imported || r.exported
    ? [r.imported && `${r.imported} arquivo(s) novo(s) do Drive`, r.exported && `${r.exported} enviado(s) para o Drive`].filter(Boolean).join(", ")
    : "tudo em dia";

// Uma tabela só: cada cliente com as pastas do Drive ligadas a ele. É a única
// tela de "configuração" da sincronização — feita uma vez.
export function FolderLinkTable({ rows }: { rows: ClientRowData[] }) {
  const router = useRouter();
  const [picking, setPicking] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // clientId, "all" ou "sugestoes"
  const [msgs, setMsgs] = useState<Record<string, Msg>>({});
  const [top, setTop] = useState<Msg | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [confirming, setConfirming] = useState<{ clientId: string; folderId: string; name: string; count: number | null | "loading" } | null>(null);

  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? "";
  const setMsg = (id: string, m: Msg) => setMsgs((prev) => ({ ...prev, [id]: m }));

  async function link(clientId: string, folder: PickedFolder) {
    setPicking(null);
    setBusy(clientId);
    try {
      const r = await post<SyncOut & { folderName: string }>("/api/drive/link-folder", { clientId, folderId: folder.id });
      setMsg(clientId, { text: `Pasta "${r.folderName}" ligada: ${summary(r)}.`, ok: true });
      setSuggestions((s) => (s ? s.filter((x) => x.clientId !== clientId) : s));
      router.refresh();
    } catch (e) {
      setMsg(clientId, { text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  // 1º passo: abre a confirmação NA HORA e conta em segundo plano quantos
  // documentos vieram da pasta (em pastas grandes a contagem demora).
  async function askUnlink(clientId: string, folder: { id: string; name: string }) {
    setConfirming({ clientId, folderId: folder.id, name: folder.name, count: "loading" });
    let count: number | null;
    try {
      count = (await post<{ removable: number }>("/api/drive/unlink-folder", { clientId, folderId: folder.id, dryRun: true })).removable;
    } catch {
      // não deu pra contar (ex.: pasta apagada no Drive): ainda dá pra só desligar
      count = null;
    }
    // só aplica se o usuário ainda está olhando esta mesma pasta
    setConfirming((c) => (c && c.clientId === clientId && c.folderId === folder.id ? { ...c, count } : c));
  }

  // 2º passo: desliga (e, se escolhido, remove do portal os documentos dessa pasta).
  async function doUnlink(removeDocuments: boolean) {
    if (!confirming) return;
    const { clientId, folderId, name } = confirming;
    setBusy(clientId);
    try {
      const r = await post<{ removed: number; batchId: string | null }>("/api/drive/unlink-folder", { clientId, folderId, removeDocuments, folderName: name });
      setMsg(clientId, {
        text: removeDocuments
          ? `Pasta "${name}" desligada e ${r.removed} documento(s) movido(s) para a Lixeira do portal (dá pra restaurar por 30 dias).`
          : `Pasta "${name}" desligada. Os documentos que já vieram dela continuam no portal.`,
        ok: true,
        undoBatch: removeDocuments && r.batchId ? r.batchId : undefined,
      });
      setConfirming(null);
      router.refresh();
    } catch (e) {
      setMsg(clientId, { text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  // Desfaz uma remoção em massa: devolve os documentos e liga a pasta de novo.
  async function undo(clientId: string, batchId: string) {
    setBusy(clientId);
    try {
      const r = await post<{ restored: number; skipped: number }>("/api/lixeira/restore", { batchId });
      setMsg(clientId, { text: `Desfeito: ${r.restored} documento(s) de volta e a pasta ligada de novo.`, ok: true });
      router.refresh();
    } catch (e) {
      setMsg(clientId, { text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function syncRow(clientId: string) {
    setBusy(clientId);
    try {
      const r = await post<SyncOut>("/api/drive/sync", { clientId });
      setMsg(clientId, { text: `Sincronizado: ${summary(r)}.`, ok: true });
      router.refresh();
    } catch (e) {
      setMsg(clientId, { text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function syncAll() {
    setBusy("all");
    setTop(null);
    let imported = 0;
    let exported = 0;
    try {
      for (let i = 0; i < rows.length; i++) {
        setTop({ text: `Sincronizando ${i + 1} de ${rows.length} — ${rows[i].name}...`, ok: true });
        const r = await post<SyncOut>("/api/drive/sync", { clientId: rows[i].id });
        imported += r.imported;
        exported += r.exported;
      }
      setTop({ text: `Pronto: ${summary({ imported, exported })}.`, ok: true });
      router.refresh();
    } catch (e) {
      setTop({ text: `Interrompido: ${(e as Error).message}`, ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function findSuggestions() {
    setBusy("sugestoes");
    setTop({ text: "Procurando no Drive pastas com o nome dos clientes...", ok: true });
    try {
      const res = await fetch("/api/drive/suggestions");
      const j = (await res.json().catch(() => ({}))) as { suggestions?: Suggestion[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Não foi possível procurar.");
      setSuggestions(j.suggestions ?? []);
      setTop({ text: (j.suggestions?.length ?? 0) ? `Achei ${j.suggestions!.length} sugestão(ões). Confira abaixo antes de ligar.` : "Não achei nenhuma pasta parecida. Use \"Escolher pasta\" em cada cliente.", ok: true });
    } catch (e) {
      setTop({ text: (e as Error).message, ok: false });
    } finally {
      setBusy(null);
    }
  }

  async function linkAllSuggested() {
    if (!suggestions?.length) return;
    setBusy("all");
    let ok = 0;
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      setTop({ text: `Ligando ${i + 1} de ${suggestions.length} — ${nameOf(s.clientId)}...`, ok: true });
      try {
        await post("/api/drive/link-folder", { clientId: s.clientId, folderId: s.folderId });
        ok++;
      } catch (e) {
        setMsg(s.clientId, { text: (e as Error).message, ok: false });
      }
    }
    setSuggestions(null);
    setBusy(null);
    setTop({ text: `${ok} pasta(s) ligada(s) e sincronizada(s).`, ok: ok === suggestions.length });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} disabled={busy !== null} onClick={findSuggestions}>
          Sugerir pastas pelo nome dos clientes
        </button>
        <button type="button" className={btnPrimary} disabled={busy !== null} onClick={syncAll}>
          Sincronizar todos
        </button>
      </div>
      {top && <p className={`text-xs ${top.ok ? "text-muted" : "text-status-danger"}`}>{top.text}</p>}

      {suggestions && suggestions.length > 0 && (
        <div className="ui-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-navy">Sugestões (nada é ligado até você confirmar)</p>
            <button type="button" className={btnPrimary} disabled={busy !== null} onClick={linkAllSuggested}>
              Ligar todas as sugeridas
            </button>
          </div>
          <ul className="mt-3 divide-y divide-border text-xs">
            {suggestions.map((s) => (
              <li key={s.clientId} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-[200px] flex-1">
                  <strong>{nameOf(s.clientId)}</strong> → pasta &quot;{s.folderName}&quot;{" "}
                  <span className="text-muted">({Math.round(s.score * 100)}% de semelhança)</span>
                </span>
                <button type="button" className={btn} disabled={busy !== null} onClick={() => link(s.clientId, { id: s.folderId, name: s.folderName })}>
                  Ligar
                </button>
                <button type="button" className="text-muted underline" onClick={() => setSuggestions(suggestions.filter((x) => x.clientId !== s.clientId))}>
                  Não é essa
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto ui-card">
        <table className="ui-table">
          <thead>
            <tr>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Pastas do Drive ligadas</th>
              <th className="px-4 py-3 font-medium">Arquivos</th>
              <th className="px-4 py-3 font-medium">Última sincronização</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-3">
                  {r.linked.length === 0 && <span className="text-xs text-muted">nenhuma (usa só a pasta &quot;Clientes MC&quot;)</span>}
                  <div className="flex flex-wrap gap-1.5">
                    {r.linked.map((f) => (
                      <span key={f.id} className="inline-flex items-center gap-1 rounded-full bg-background px-2.5 py-1 text-xs">
                        📁 {f.name}
                        <button type="button" disabled={busy !== null} onClick={() => askUnlink(r.id, f)} aria-label={`Desligar ${f.name}`} title="Desligar esta pasta" className="text-muted hover:text-status-danger">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {confirming?.clientId === r.id && (
                    <div className="mt-2 max-w-[520px] rounded-lg border border-status-pending bg-background p-3 text-xs">
                      <p className="font-medium text-foreground">Desligar a pasta &quot;{confirming.name}&quot;?</p>
                      <p className="mt-1 text-muted">
                        {confirming.count === "loading"
                          ? "Contando quantos documentos vieram desta pasta… (pode levar alguns segundos em pastas grandes)"
                          : confirming.count === null
                          ? "Não consegui contar quantos documentos vieram desta pasta."
                          : confirming.count === 0
                            ? "Nenhum documento deste cliente veio desta pasta."
                            : `Esta pasta trouxe ${confirming.count} documento(s) para este cliente.`}{" "}
                        Os arquivos no Drive <strong>nunca</strong> são apagados. O que sair do portal fica 30 dias na Lixeira e pode ser restaurado.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className={btn} disabled={busy !== null} onClick={() => doUnlink(false)}>
                          Só desligar (manter os documentos)
                        </button>
                        {typeof confirming.count === "number" && confirming.count > 0 && (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => doUnlink(true)}
                            className="rounded-lg bg-status-danger px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                          >
                            Desligar e mandar os {confirming.count} documento(s) pra Lixeira
                          </button>
                        )}
                        <button type="button" className="text-muted underline" onClick={() => setConfirming(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                  {picking === r.id && (
                    <div className="mt-2 min-w-[360px]">
                      <FolderPicker onPick={(f) => link(r.id, f)} onClose={() => setPicking(null)} />
                    </div>
                  )}
                  {msgs[r.id] && (
                    <p className={`mt-1 text-xs ${msgs[r.id].ok ? "text-status-success" : "text-status-danger"}`}>
                      {msgs[r.id].text}
                      {msgs[r.id].undoBatch && (
                        <>
                          {" "}
                          <button type="button" disabled={busy !== null} onClick={() => undo(r.id, msgs[r.id].undoBatch!)} className="font-semibold text-navy underline disabled:opacity-50">
                            Desfazer
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted">{r.driveDocs}</td>
                <td className="px-4 py-3 text-xs text-muted">{r.lastSync ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={btn} disabled={busy !== null} onClick={() => setPicking(picking === r.id ? null : r.id)}>
                      Escolher pasta
                    </button>
                    <button type="button" className={btn} disabled={busy !== null} onClick={() => syncRow(r.id)}>
                      {busy === r.id ? "..." : "Sincronizar"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
